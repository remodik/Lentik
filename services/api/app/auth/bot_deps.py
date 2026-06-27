"""Аутентификация ботов по bot-токену.

Бот шлёт ``Authorization: Bearer lbot_…``. Токен хешируется и ищется в `bots`.
Возвращаем identity-`User` бота (с проверками is_bot/бан), дальше переиспользуем
обычные `_require_member` / `require_chat_perm` — бот это такой же member.

Разделение с людьми чистое: у ботов нет PIN/JWT, а bot-токен не является валидным
JWT, поэтому он не пройдёт `get_current_user` (человеческие эндпоинты), а
человеческий cookie/JWT не пройдёт сюда (это не bot-токен).
"""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.bot_tokens import TOKEN_PREFIX, hash_bot_token
from app.db.deps import get_db
from app.models.bot import Bot
from app.models.user import User


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip() or None
    return None


async def get_current_bot(
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    token = _extract_bearer(authorization)
    if not token or not token.startswith(TOKEN_PREFIX):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bot token required",
        )

    bot = await db.scalar(select(Bot).where(Bot.token_hash == hash_bot_token(token)))
    if bot is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bot token",
        )

    user = await db.get(User, bot.user_id)
    if user is None or not user.is_bot:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bot not found",
        )

    from app.services.bans import enforce_not_banned

    await enforce_not_banned(db, user)
    return user
