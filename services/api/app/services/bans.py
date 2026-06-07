"""Глобальные баны пользователей: проверка статуса и ленивое автоснятие.

Используется и в auth-dependency (каждый запрос), и в эндпоинте логина.
Структурированный 403-payload позволяет фронту отличить бан от прочих ошибок
и показать причину со сроком.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


def _ban_detail(user: User) -> dict:
    return {
        "code": "account_banned",
        "reason": user.ban_reason,
        "expires_at": user.ban_expires_at.isoformat() if user.ban_expires_at else None,
    }


def is_banned_now(user: User) -> bool:
    """True, если бан пользователя активен прямо сейчас (без commit/raise).

    Для WS-хендшейка, где нельзя кидать HTTPException и нежелательно писать в БД.
    Ленивое автоснятие истёкшего бана оставляем REST-пути (`enforce_not_banned`):
    следующий обычный запрос пользователя снимет просроченный бан.
    """
    if not user.is_banned:
        return False
    exp = user.ban_expires_at
    return exp is None or exp > datetime.now(timezone.utc)


async def enforce_not_banned(db: AsyncSession, user: User) -> None:
    """Кидает 403 со структурированным detail, если пользователь забанен.

    Если срок бана истёк — лениво снимает бан (is_banned=False) и пропускает.
    Commit делает сам (снятие бана не должно зависеть от вызывающего кода).
    """
    if not user.is_banned:
        return

    now = datetime.now(timezone.utc)
    if user.ban_expires_at is not None and user.ban_expires_at <= now:
        # Срок истёк — снимаем бан и пропускаем.
        user.is_banned = False
        user.ban_reason = None
        user.ban_expires_at = None
        await db.commit()
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=_ban_detail(user),
    )
