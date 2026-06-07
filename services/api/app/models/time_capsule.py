"""Капсула времени: семья совместно наполняет её записями, всё запечатано
серверно до даты ``unlock_at``, затем открывается."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class TimeCapsule(Base):
    __tablename__ = "time_capsules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    unlock_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    # Флаг только для UX/уведомления — гейт доступа считается от unlock_at vs now.
    opened: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    entries: Mapped[list["TimeCapsuleEntry"]] = relationship(
        back_populates="capsule", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<TimeCapsule {self.title!r} unlock={self.unlock_at}>"


class TimeCapsuleEntry(Base):
    __tablename__ = "time_capsule_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    capsule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("time_capsules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    # Список вложений в формате сообщений: {kind,url,file_name,file_size,content_type}
    attachments: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    capsule: Mapped["TimeCapsule"] = relationship(back_populates="entries")
    author: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<TimeCapsuleEntry capsule={self.capsule_id} author={self.author_id}>"
