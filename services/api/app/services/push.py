"""Отправка Web Push (VAPID) уведомлений.

Включается только при заданных `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` — иначе
все функции — no-op (приложение работает как раньше, уведомления только по WS).

`pywebpush` синхронный и опциональный (ленивый импорт): без ключей пакет не
нужен. Отправка идёт в thread-executor, чтобы не блокировать event loop.
Просроченные подписки (404/410 от push-сервиса) удаляются.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Iterable
from uuid import UUID

from app.core.config import settings
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


def is_push_enabled() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


async def recipients_for_family(db, family_id: UUID) -> list[UUID]:
    """user_id всех участников семьи (для рассылки семейных уведомлений)."""
    from sqlalchemy import select

    from app.models.membership import Membership

    rows = await db.scalars(
        select(Membership.user_id).where(Membership.family_id == family_id)
    )
    return list(rows.all())


def _send_one(subscription_info: dict, data: dict) -> int | None:
    """Отправляет один push (синхронно). Возвращает HTTP-статус при ошибке
    push-сервиса (для отбраковки просроченных) или None при успехе."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(data, ensure_ascii=False),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=3600,
        )
        return None
    except WebPushException as exc:
        return getattr(getattr(exc, "response", None), "status_code", 0) or 0
    except Exception:  # noqa: BLE001
        logger.exception("web push send failed")
        return None


async def send_push_to_users(user_ids: Iterable[UUID], payload: dict) -> None:
    """Шлёт push всем подпискам перечисленных пользователей. Best-effort:
    исключения не пробрасываются, просроченные подписки удаляются.

    Открывает СОБСТВЕННУЮ сессию — не вмешивается в транзакцию вызывающего
    диспетчера (там идёт SELECT ... FOR UPDATE по напоминаниям/событиям)."""
    if not is_push_enabled():
        return
    ids = list(dict.fromkeys(user_ids))  # дедуп, сохраняем UUID
    if not ids:
        return

    try:
        import pywebpush  # noqa: F401
    except Exception:  # noqa: BLE001
        logger.warning(
            "VAPID-ключи заданы, но пакет pywebpush не установлен — "
            "push не отправляется. Установите: pip install pywebpush"
        )
        return

    from sqlalchemy import delete, select

    from app.models.push_subscription import PushSubscription

    async with AsyncSessionLocal() as db:
        subs = (
            await db.scalars(
                select(PushSubscription).where(PushSubscription.user_id.in_(ids))
            )
        ).all()
        if not subs:
            return

        loop = asyncio.get_running_loop()
        gone: list[str] = []

        async def _handle(sub: PushSubscription) -> None:
            info = {
                "endpoint": sub.endpoint,
                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
            }
            status = await loop.run_in_executor(None, _send_one, info, payload)
            if status in (404, 410):
                gone.append(sub.endpoint)

        await asyncio.gather(*(_handle(s) for s in subs), return_exceptions=True)

        if gone:
            await db.execute(
                delete(PushSubscription).where(PushSubscription.endpoint.in_(gone))
            )
            await db.commit()
