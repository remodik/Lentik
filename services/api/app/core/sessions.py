import hashlib
import secrets
from datetime import datetime, timedelta, timezone

SESSION_TTL_DAYS = 30
COOKIE_NAME = "lentik_session"


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def expires_at(days: int = SESSION_TTL_DAYS) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)