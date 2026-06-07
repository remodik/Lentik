"""Журнал аудита платформенного уровня: действия разработчика/оператора.

В отличие от ``audit_log`` (привязан к семье), эти записи глобальны и не имеют
``family_id`` — например, бан/разбан пользователя во всём приложении.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlatformAuditLogEntry(Base):
    """Одна запись глобального журнала аудита.

    ``action`` — машинное имя события (например, ``user.banned``).
    ``target_type`` / ``target_id`` — объект действия (``user``, ``family`` и т.д.).
    ``metadata_json`` — произвольная JSONB-нагрузка (причина, срок и пр.).
    """

    __tablename__ = "platform_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Может быть NULL, если actor был удалён.
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    target_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(
        "metadata", JSONB, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
