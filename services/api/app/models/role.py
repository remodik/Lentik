"""Роли и их привязки к участникам.

Архитектура:
  * Роль принадлежит семье, имеет имя/цвет/приоритет и битовое поле прав.
  * @everyone — служебная роль, автоматически применяется ко всем.
  * Преcет-роли создаются автоматически при создании семьи.
  * Один участник может иметь несколько ролей. Финальные права = OR прав всех ролей.
  * Owner-роль обладает битом ADMINISTRATOR, который шунтирует любые проверки.
  * Поверх базовых прав применяются per-channel / per-chat overrides
    (см. app.models.permission_override).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.family import Family
    from app.models.membership import Membership


class FamilyRole(Base):
    """Роль внутри одной семьи."""

    __tablename__ = "family_roles"
    __table_args__ = (
        UniqueConstraint("family_id", "slug", name="uq_family_role_slug"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Стабильный машинный идентификатор пресета (owner / coowner / parent / teen / child / everyone)
    # либо null для пользовательских ролей.
    slug: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="#a1a1aa")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Битовое поле прав. BigInteger чтобы хватило на расширение в будущем.
    permissions: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    is_preset: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # @everyone — единственная такая роль на семью, применяется ко всем участникам.
    is_everyone: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Защищённые системные роли нельзя удалять/переименовывать (Owner, @everyone).
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    family: Mapped["Family"] = relationship()
    member_links: Mapped[list["MemberRole"]] = relationship(
        back_populates="role", cascade="all, delete-orphan"
    )


class MemberRole(Base):
    """Назначение роли участнику семьи (M:N через таблицу-связку)."""

    __tablename__ = "member_roles"
    __table_args__ = (
        UniqueConstraint("membership_id", "role_id", name="uq_member_role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    membership_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("memberships.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("family_roles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    role: Mapped[FamilyRole] = relationship(back_populates="member_links")
    membership: Mapped["Membership"] = relationship()
