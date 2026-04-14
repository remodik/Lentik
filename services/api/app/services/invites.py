from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invite import Invite


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _validate_invite(invite: Invite) -> None:
    now = datetime.now(timezone.utc)
    if now > _as_utc(invite.expires_at):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Инвайт истёк")

    if invite.uses_count >= invite.max_uses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Лимит использований инвайта исчерпан",
        )


async def lock_active_invite(db: AsyncSession, token: str) -> Invite:
    invite = await db.scalar(
        select(Invite).where(Invite.token == token).with_for_update()
    )
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Инвайт не найден")

    _validate_invite(invite)
    return invite


def consume_invite(invite: Invite) -> None:
    _validate_invite(invite)
    invite.uses_count += 1
