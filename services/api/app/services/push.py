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
from datetime import datetime, timezone
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


async def notify_new_message(
    *,
    chat_id: UUID,
    family_id: UUID,
    is_18plus: bool,
    exclude_user_id: UUID,
    title: str,
    body: str,
) -> None:
    """Push о новом сообщении всем, кто видит этот чат, кроме автора.

    Открывает СОБСТВЕННУЮ сессию (как и `send_push_to_users`) — вызывается
    через `asyncio.create_task` сразу после ответа на запрос, чтобы доставка
    push не задерживала отправку сообщения; к моменту выполнения задачи
    сессия исходного запроса может быть уже закрыта.

    Получателей фильтруем по тем же правилам, что и на чтение (VIEW_CHANNEL,
    возрастной ценз 18+) — иначе push сам стал бы утечкой факта существования
    сообщения тем, кому чат не должен быть виден."""
    if not is_push_enabled():
        return

    from sqlalchemy import select

    from app.core.permissions import Perm, has_perm
    from app.models.membership import Membership
    from app.models.user import User
    from app.services.roles import effective_permissions_for_chats

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(Membership, User)
                .join(User, User.id == Membership.user_id)
                .where(
                    Membership.family_id == family_id,
                    Membership.user_id != exclude_user_id,
                )
            )
        ).all()
        if not rows:
            return

        recipients: list[UUID] = []
        today = datetime.now(timezone.utc).date()
        for m, u in rows:
            is_owner = m.role.value == "owner"
            if is_18plus and not is_owner:
                bd = u.birthday
                if bd is None:
                    continue
                age = today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day))
                if age < 18:
                    continue
            if not is_owner:
                perms = await effective_permissions_for_chats(db, m, [chat_id])
                if not has_perm(perms.get(chat_id, 0), Perm.VIEW_CHANNEL):
                    continue
            recipients.append(m.user_id)

    if recipients:
        await send_push_to_users(
            recipients,
            {"title": title, "body": body, "tag": f"chat-{chat_id}", "url": "/"},
        )
