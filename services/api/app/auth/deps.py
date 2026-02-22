from datetime import datetime, timezone

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sessions import COOKIE_NAME, hash_token
from app.db.deps import get_db
from app.models.session import Session
from app.models.user import User


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    lentik_session: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> User:
    if not lentik_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token_h = hash_token(lentik_session)

    sess = await db.scalar(select(Session).where(Session.token_hash == token_h))
    if not sess:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    if sess.expires_at <= datetime.now(timezone.utc):
        # подчистим просроченную
        await db.execute(delete(Session).where(Session.id == sess.id))
        await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    user = await db.scalar(select(User).where(User.id == sess.user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user