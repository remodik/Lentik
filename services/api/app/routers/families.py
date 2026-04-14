from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.core.jwt import COOKIE_NAME, decode_access_token
from app.db.deps import get_db
from app.models.family import Family
from app.models.membership import Membership, Role
from app.models.user import User
from app.schemas.families import (
    ChangeMemberRoleRequest,
    CreateFamilyRequest,
    FamilyDetailResponse,
    FamilyMemberResponse,
    FamilyResponse,
    TransferOwnershipRequest,
)
from app.services.family import create_family, require_membership, require_owner
from app.ws.manager import ws_manager

router = APIRouter(prefix="/families", tags=["families"])


def _presence_payload(
    family_id: UUID,
    user_id: UUID,
    is_online: bool,
    last_seen_at: datetime | None,
) -> dict:
    return {
        "type": "presence_update",
        "family_id": str(family_id),
        "user_id": str(user_id),
        "is_online": is_online,
        "last_seen_at": last_seen_at.isoformat() if last_seen_at else None,
    }


def _family_to_detail_response(family: Family) -> FamilyDetailResponse:
    members = [
        FamilyMemberResponse(
            user_id=m.user_id,
            username=m.user.username,
            display_name=m.user.display_name,
            avatar_url=m.user.avatar_url,
            bio=m.user.bio,
            birthday=m.user.birthday,
            is_online=m.user.is_online,
            last_seen_at=m.user.last_seen_at,
            role=m.role,
            joined_at=m.created_at,
        )
        for m in family.memberships
    ]
    return FamilyDetailResponse(
        id=family.id,
        name=family.name,
        created_at=family.created_at,
        members=members,
    )


async def _transfer_ownership(
    family_id: UUID,
    target_user_id: UUID,
    current_owner_id: UUID,
    db: AsyncSession,
) -> tuple[Membership, FamilyDetailResponse]:
    current_owner_membership = await db.scalar(
        select(Membership)
        .where(
            Membership.family_id == family_id,
            Membership.user_id == current_owner_id,
        )
        .options(selectinload(Membership.user))
    )
    if not current_owner_membership:
        raise HTTPException(status_code=404, detail="Owner membership not found")

    target_membership = await db.scalar(
        select(Membership)
        .where(
            Membership.family_id == family_id,
            Membership.user_id == target_user_id,
        )
        .options(selectinload(Membership.user))
    )
    if not target_membership:
        raise HTTPException(status_code=404, detail="Member not found")

    async with db.begin_nested():
        current_owner_membership.role = Role.MEMBER
        target_membership.role = Role.OWNER

    await db.commit()

    family = await db.scalar(
        select(Family)
        .where(Family.id == family_id)
        .options(selectinload(Family.memberships).selectinload(Membership.user))
    )
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    await ws_manager.broadcast_to_family(
        family_id,
        {
            "type": "ownership_transferred",
            "new_owner_id": str(target_user_id),
            "new_owner_name": target_membership.user.display_name,
            "prev_owner_id": str(current_owner_id),
        },
    )

    return target_membership, _family_to_detail_response(family)


@router.post("", response_model=FamilyResponse, status_code=status.HTTP_201_CREATED)
async def create_family_endpoint(
    body: CreateFamilyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await create_family(name=body.name, owner=user, db=db)


@router.get("/{family_id}", response_model=FamilyDetailResponse)
async def get_family(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    family = await db.scalar(
        select(Family)
        .where(Family.id == family_id)
        .options(selectinload(Family.memberships).selectinload(Membership.user))
    )
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    return _family_to_detail_response(family)


@router.patch("/{family_id}", response_model=FamilyResponse)
async def rename_family(
    family_id: UUID,
    body: CreateFamilyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_owner(family_id, user, db)

    family = await db.get(Family, family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    family.name = body.name
    await db.commit()
    await db.refresh(family)
    return family


@router.delete("/{family_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def kick_member(
    family_id: UUID,
    member_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_owner(family_id, user, db)

    if member_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot kick yourself")

    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == member_id,
        )
    )
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(m)
    await db.commit()

    kicked_user = await db.get(User, member_id)
    await ws_manager.broadcast_to_family(
        family_id,
        {
            "type": "member_kicked",
            "user_id": str(member_id),
            "display_name": kicked_user.display_name if kicked_user else "Участник",
        },
    )


@router.patch("/{family_id}/members/{member_id}/role", response_model=FamilyMemberResponse)
async def change_member_role(
    family_id: UUID,
    member_id: UUID,
    body: ChangeMemberRoleRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_owner(family_id, user, db)

    if member_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    if body.role == Role.OWNER:
        target_membership, _ = await _transfer_ownership(
            family_id=family_id,
            target_user_id=member_id,
            current_owner_id=user.id,
            db=db,
        )
        return FamilyMemberResponse(
            user_id=target_membership.user_id,
            username=target_membership.user.username,
            display_name=target_membership.user.display_name,
            avatar_url=target_membership.user.avatar_url,
            bio=target_membership.user.bio,
            birthday=target_membership.user.birthday,
            is_online=target_membership.user.is_online,
            last_seen_at=target_membership.user.last_seen_at,
            role=target_membership.role,
            joined_at=target_membership.created_at,
        )

    m = await db.scalar(
        select(Membership)
        .where(Membership.family_id == family_id, Membership.user_id == member_id)
        .options(selectinload(Membership.user))
    )
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")

    m.role = body.role
    await db.commit()
    await db.refresh(m)

    return FamilyMemberResponse(
        user_id=m.user_id,
        username=m.user.username,
        display_name=m.user.display_name,
        avatar_url=m.user.avatar_url,
        bio=m.user.bio,
        birthday=m.user.birthday,
        is_online=m.user.is_online,
        last_seen_at=m.user.last_seen_at,
        role=m.role,
        joined_at=m.created_at,
    )


@router.post("/{family_id}/transfer-ownership", response_model=FamilyDetailResponse)
async def transfer_ownership(
    family_id: UUID,
    body: TransferOwnershipRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_owner(family_id, user, db)

    if body.user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot transfer ownership to yourself")

    _, updated_family = await _transfer_ownership(
        family_id=family_id,
        target_user_id=body.user_id,
        current_owner_id=user.id,
        db=db,
    )
    return updated_family


@router.websocket("/{family_id}/ws")
async def family_ws(
    websocket: WebSocket,
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    token = websocket.cookies.get(COOKIE_NAME)
    if not token:
        token = websocket.query_params.get("token")

    user_id = decode_access_token(token) if token else None
    if not user_id:
        await websocket.close(code=4001)
        return

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        await websocket.close(code=4001)
        return

    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user.id,
        )
    )
    if not m:
        await websocket.close(code=4003)
        return

    await websocket.accept()
    await ws_manager.connect_family(family_id, websocket)
    became_online = ws_manager.register_presence_connection(family_id, user.id, websocket)
    if became_online or not user.is_online:
        user.is_online = True
        await db.commit()
        await ws_manager.broadcast_to_family(
            family_id,
            _presence_payload(
                family_id=family_id,
                user_id=user.id,
                is_online=True,
                last_seen_at=user.last_seen_at,
            ),
        )

    # Always send the caller's current presence state to avoid stale UI on connect races.
    await websocket.send_json(
        _presence_payload(
            family_id=family_id,
            user_id=user.id,
            is_online=user.is_online,
            last_seen_at=user.last_seen_at,
        )
    )

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect_family(family_id, websocket)
        became_offline = ws_manager.unregister_presence_connection(
            family_id,
            user.id,
            websocket,
        )
        if became_offline:
            user.is_online = False
            user.last_seen_at = datetime.now(timezone.utc)
            await db.commit()
            await ws_manager.broadcast_to_family(
                family_id,
                _presence_payload(
                    family_id=family_id,
                    user_id=user.id,
                    is_online=False,
                    last_seen_at=user.last_seen_at,
                ),
            )
