import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models import Family, Invite, Membership, Role, User
from app.schemas.invites import CreateInviteRequest, CreateInviteResponse

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
    if not membership or membership.role != Role.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only family owner can create invites",
        )

    if body.revoke_previous:
        await db.execute(
            delete(Invite).where(Invite.family_id == body.family_id)
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)

    invite = Invite(family_id=body.family_id, token=token, expires_at=expires_at)
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    base_url = str(request.base_url).rstrip("/")
    join_url = f"{base_url}/join?token={token}"

    return CreateInviteResponse(token=token, expires_at=expires_at, join_url=join_url)
