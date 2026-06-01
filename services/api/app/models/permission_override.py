"""Permission overrides на конкретный канал или чат.

Каждая запись = «для этой роли или участника в этом канале/чате: allow эти биты,
deny эти биты». При вычислении effective-прав:

    base = OR(прав всех ролей пользователя)
    if ADMINISTRATOR in base: return ALL
    for override in overrides_for_user_roles:
        base &= ~deny
        base |= allow
    if override_for_user:
        base &= ~deny
        base |= allow
    return base
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.channel import Channel
    from app.models.chat import Chat
    from app.models.role import FamilyRole
    from app.models.user import User


class ChannelPermissionOverride(Base):
    __tablename__ = "channel_permission_overrides"
    __table_args__ = (
        CheckConstraint(
            "(role_id IS NOT NULL AND user_id IS NULL) OR "
            "(role_id IS NULL AND user_id IS NOT NULL)",
            name="ck_channel_override_one_subject",
        ),
        Index(
            "uq_channel_permission_overrides_channel_role",
            "channel_id",
            "role_id",
            unique=True,
            postgresql_where=text("role_id IS NOT NULL"),
        ),
        Index(
            "uq_channel_permission_overrides_channel_user",
            "channel_id",
            "user_id",
            unique=True,
            postgresql_where=text("user_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    channel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("channels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("family_roles.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    allow: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    deny: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    role: Mapped["FamilyRole | None"] = relationship()
    user: Mapped["User | None"] = relationship()


class ChatPermissionOverride(Base):
    __tablename__ = "chat_permission_overrides"
    __table_args__ = (
        CheckConstraint(
            "(role_id IS NOT NULL AND user_id IS NULL) OR "
            "(role_id IS NULL AND user_id IS NOT NULL)",
            name="ck_chat_override_one_subject",
        ),
        Index(
            "uq_chat_permission_overrides_chat_role",
            "chat_id",
            "role_id",
            unique=True,
            postgresql_where=text("role_id IS NOT NULL"),
        ),
        Index(
            "uq_chat_permission_overrides_chat_user",
            "chat_id",
            "user_id",
            unique=True,
            postgresql_where=text("user_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    chat_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chats.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("family_roles.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    allow: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    deny: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    role: Mapped["FamilyRole | None"] = relationship()
    user: Mapped["User | None"] = relationship()
