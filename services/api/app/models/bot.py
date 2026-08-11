import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class Bot(Base):
    """Бот-специфика поверх identity-пользователя.

    Сам бот — это обычный `User` с `is_bot=True` (и его `Membership` в семье),
    поэтому права/роли/рендер сообщений переиспользуются как есть. Здесь храним
    только то, что специфично для бота: владельца и хеш токена доступа.
    """

    __tablename__ = "bots"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Identity-пользователь бота (его username/display_name/avatar/is_bot).
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    # Кто управляет ботом (создатель). При удалении владельца бот удаляется.
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # sha256(token) в hex — сам токен не храним. Уникален для быстрого поиска.
    token_hash: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    # Первые символы токена для узнавания в UI ("lbot_Ab12…").
    token_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    owner: Mapped["User"] = relationship(foreign_keys=[owner_id])

    def __repr__(self) -> str:
        return f"<Bot user={self.user_id} owner={self.owner_id}>"
