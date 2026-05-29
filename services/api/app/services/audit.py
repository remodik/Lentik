"""Удобный хелпер для добавления записей в журнал аудита.

Записываем коротко и одним вызовом: ``await log_action(db, ...)``.
Запись делается в текущей транзакции — если вызвать перед ``db.commit``,
она зафиксируется атомарно вместе с основным действием.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLogEntry


async def log_action(
    db: AsyncSession,
    *,
    family_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Добавляет запись в журнал. Не вызывает commit самостоятельно."""
    entry = AuditLogEntry(
        family_id=family_id,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        metadata_json=metadata,
    )
    db.add(entry)
    await db.flush()


# Известные коды действий — для документации и UI. Сервер не валидирует
# действие против списка, но фронт будет на это ориентироваться.
ACTIONS = {
    # Семья
    "family.renamed": "Семья переименована",
    "family.member_joined": "Участник присоединился",
    "family.member_kicked": "Участник исключён",
    "family.ownership_transferred": "Передача прав владельца",
    "family.invite_created": "Создано приглашение",

    # Чаты / каналы
    "chat.created": "Создан чат",
    "chat.deleted": "Удалён чат",
    "chat.updated": "Изменены настройки чата",
    "chat.pinned": "Закреплено сообщение",
    "chat.unpinned": "Откреплено сообщение",
    "channel.created": "Создан канал",
    "channel.deleted": "Удалён канал",
    "channel.updated": "Изменены настройки канала",

    # Сообщения (логируем только удаления чужих и edit'ы чужих)
    "message.deleted_by_moderator": "Модератор удалил сообщение",
    "message.edited_by_moderator": "Модератор отредактировал сообщение",

    # Роли
    "role.created": "Создана роль",
    "role.updated": "Изменена роль",
    "role.deleted": "Удалена роль",
    "role.assigned": "Назначены роли участнику",

    # Permission overrides
    "override.changed": "Изменены права на канале/чате",
    "override.removed": "Сброшены права на канале/чате",
}
