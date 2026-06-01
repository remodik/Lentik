"""Настройки модерации семьи (one-to-one с Family)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.family import Family


class FamilyModerationSettings(Base):
    """Одна строка на семью. ``family_id`` = PK (связь один-к-одному).

    Лёгкая модерация без ML:
      * invite_max_active — макс. число одновременно активных приглашений (0 = без лимита);
      * slowmode_default_seconds — дефолтный медленный режим для новых чатов/каналов;
      * banned_words — список стоп-слов (регистронезависимо, по словам);
      * max_message_length — доп. лимит длины сообщения поверх 4000 (0 = дефолт 4000).
    """

    __tablename__ = "family_moderation_settings"

    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        primary_key=True,
    )
    invite_max_active: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    slowmode_default_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    banned_words: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    max_message_length: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    family: Mapped["Family"] = relationship()

    def __repr__(self) -> str:
        return f"<FamilyModerationSettings family={self.family_id}>"
