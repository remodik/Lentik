from datetime import timedelta

from fastapi import Cookie, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.jwt import COOKIE_NAME, decode_access_token
from app.db.deps import get_db
from app.models.user import User


# Допуск в 1 секунду на расхождение часов клиента/БД и округление iat до секунды.
_REVOCATION_SKEW = timedelta(seconds=1)


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    lentik_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    authorization: str | None = Header(default=None),
) -> User:
    token = lentik_token
    if not token and authorization:
        parts = authorization.strip().split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1].strip() or None

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    decoded = decode_access_token(token)
    if decoded is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user_id, token_iat = decoded

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # Стэйтлесс-revocation: токен, выпущенный до последней смены PIN /
    # logout-everywhere, недействителен.
    if token_iat + _REVOCATION_SKEW < user.password_changed_at:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token revoked",
        )

    # Глобальный бан: 403 со структурированным payload (либо ленивое снятие).
    from app.services.bans import enforce_not_banned

    await enforce_not_banned(db, user)

    return user


async def require_developer(user: User = Depends(get_current_user)) -> User:
    """Гейт для платформенных (админских) роутов: пускает только разработчика."""
    if not user.is_developer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ только для разработчика",
        )
    return user
