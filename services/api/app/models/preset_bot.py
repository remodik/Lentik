import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class PresetBot(Base):
    """Встроенный «готовый» бот семьи, работающий по расписанию (трек D).

    В отличие от Dev-ботов (`Bot`), у пресета нет токена и gateway — он крутится
    на сервере через `preset_dispatcher` и постит от имени своей бот-личности
    (`User(is_bot=True)` + `Membership`). Одна семья — не больше одного пресета
    каждого вида (`uq_family_preset`).
    """

    __tablename__ = "preset_bots"
    __table_args__ = (
        UniqueConstraint("family_id", "preset_key", name="uq_family_preset"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Ключ пресета: "birthday" | "digest" (см. app/services/preset_bots.py).
    preset_key: Mapped[str] = mapped_column(String(32), nullable=False)
    # Identity-пользователь бота (от кого идёт пост).
    bot_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Куда постить. NULL — пресет включён, но чат ещё не выбран (не сработает).
    target_chat_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chats.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Настройки пресета: {"hour": 9, "tz_offset_minutes": 180}.
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    # Когда пресет в последний раз отработал (дедуп «раз в день»).
    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    bot_user: Mapped["User"] = relationship(foreign_keys=[bot_user_id])

    def __repr__(self) -> str:
        return f"<PresetBot {self.preset_key} family={self.family_id} enabled={self.enabled}>"
