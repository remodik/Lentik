from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.membership import Membership, Role
from app.models.user import User
from app.services.invites import consume_invite, lock_active_invite

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
    invite = await lock_active_invite(db, body.token)

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
    consume_invite(invite)
    await db.commit()

    return JoinResponse(family_id=invite.family_id)
