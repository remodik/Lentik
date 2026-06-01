import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.permissions import Perm
from app.db.deps import get_db
from app.models import Family, Invite, Membership, Role, User
from app.schemas.invites import CreateInviteRequest, CreateInviteResponse
from app.services.audit import log_action
from app.services.moderation import count_active_invites, get_settings
from app.services.roles import require_family_perm

router = APIRouter(prefix="/invites", tags=["invites"])


@router.post("", response_model=CreateInviteResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: CreateInviteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CreateInviteResponse:
    family = await db.get(Family, body.family_id)
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")

    membership = await db.scalar(
        select(Membership).where(
            Membership.family_id == body.family_id,
            Membership.user_id == current_user.id,
        )
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a family member",
        )
    await require_family_perm(db, membership, Perm.CREATE_INVITES)

    if body.revoke_previous:
        await db.execute(
            delete(Invite).where(Invite.family_id == body.family_id)
        )

    # Лимит одновременно активных приглашений (0 = без лимита). Считаем после
    # возможного revoke_previous — удалённые в этой транзакции уже не активны.
    mod = await get_settings(db, body.family_id)
    if mod and mod.invite_max_active > 0:
        active = await count_active_invites(db, body.family_id)
        if active >= mod.invite_max_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Достигнут лимит активных приглашений "
                    f"({mod.invite_max_active}). Отзовите старые приглашения."
                ),
            )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)

    invite = Invite(
        family_id=body.family_id,
        token=token,
        max_uses=body.max_uses,
        expires_at=expires_at,
    )
    db.add(invite)
    await db.flush()
    await log_action(
        db,
        family_id=body.family_id,
        actor_id=current_user.id,
        action="family.invite_created",
        target_type="invite",
        target_id=invite.id,
        metadata={
            "max_uses": invite.max_uses,
            "expires_at": invite.expires_at.isoformat(),
        },
    )
    await db.commit()
    await db.refresh(invite)

    base_url = str(request.base_url).rstrip("/")
    join_url = f"{base_url}/join?token={token}"

    return CreateInviteResponse(
        token=token,
        expires_at=invite.expires_at,
        max_uses=invite.max_uses,
        uses_count=invite.uses_count,
        join_url=join_url,
    )
