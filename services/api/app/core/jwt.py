from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import JWTError, jwt
from typing import Any
from app.core.config import settings

SECRET_KEY = settings.jwt_secret
ALGORITHM = "HS256"
COOKIE_NAME = "lentik_token"
ACCESS_TOKEN_EXPIRE_DAYS = 30


def create_access_token(user_id: UUID, *, not_before: datetime | None = None) -> str:
    """Выпустить JWT.

    Если передан `not_before` (как правило, `user.password_changed_at`),
    `iat` сдвигается на одну секунду вперёд от него — гарантия, что
    свежевыпущенный токен не будет отклонён проверкой
    `iat >= password_changed_at` из-за разной точности часов/Postgres.
    """
    now = datetime.now(timezone.utc)
    iat = now
    if not_before is not None and iat <= not_before:
        iat = not_before + timedelta(seconds=1)
    exp = iat + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "iat": int(iat.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> tuple[UUID, datetime] | None:
    """Вернуть (user_id, iat) или None при невалидном токене."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            return None
        iat_raw = payload.get("iat")
        if iat_raw is None:
            return None
        iat = datetime.fromtimestamp(int(iat_raw), tz=timezone.utc)
        return UUID(sub), iat
    except (JWTError, ValueError, TypeError, OSError):
        return None
