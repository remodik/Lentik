"""Общий ленивый клиент Redis для масштабирования.

Если `settings.redis_url` не задан или библиотека `redis` недоступна — возвращает
None, и вызывающий код работает в single-process режиме (in-memory fallback).

Клиент создаётся лениво на текущем event loop и кэшируется на процесс.
"""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis = None
_init_attempted = False


def is_enabled() -> bool:
    return bool(settings.redis_url)


async def get_redis():
    """Вернуть подключённый redis.asyncio.Redis или None.

    None означает «работаем локально, без общего брокера».
    """
    global _redis, _init_attempted

    if not settings.redis_url:
        return None
    if _redis is not None:
        return _redis
    if _init_attempted:
        # Уже пробовали и не смогли — не долбим повторно на каждом вызове.
        return _redis

    _init_attempted = True
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        # Проверим соединение, чтобы не отдать «битый» клиент.
        await client.ping()
        _redis = client
        logger.info("Redis connected: shared WS fan-out / rate-limit enabled")
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "REDIS_URL задан, но подключиться не удалось (%s). "
            "Работаем в single-process режиме.",
            exc,
        )
        _redis = None
    return _redis


async def close_redis() -> None:
    global _redis, _init_attempted
    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception:  # noqa: BLE001
            pass
    _redis = None
    _init_attempted = False
