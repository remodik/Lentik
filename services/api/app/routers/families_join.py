from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.invite import Invite
from app.models.membership import Membership, Role
from app.models.user import User

router = APIRouter(prefix="/families", tags=["families"])


class JoinRequest(BaseModel):
    token: str


class JoinResponse(BaseModel):
    family_id: UUID


@router.post("/join", response_model=JoinResponse)
async def join_family(
    body: JoinRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Присоединиться к семье по токену (для уже авторизованных)."""
    invite = await db.scalar(select(Invite).where(Invite.token == body.token))
    if not invite:
        raise HTTPException(status_code=404, detail="Инвайт не найден")

    now = datetime.now(timezone.utc)
    expires = invite.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        raise HTTPException(status_code=400, detail="Инвайт истёк")

    existing = await db.scalar(
        select(Membership).where(
            Membership.family_id == invite.family_id,
            Membership.user_id == user.id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Ты уже в этой семье")

    membership = Membership(
        family_id=invite.family_id,
        user_id=user.id,
        role=Role.MEMBER,
    )
    db.add(membership)
    await db.delete(invite)
    await db.commit()

    return JoinResponse(family_id=invite.family_id)