import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.message import Message
    from app.models.user import User


class MessageReaction(Base):
    __tablename__ = "message_reactions"
    __table_args__ = (
        Index("ix_message_reactions_message_id", "message_id"),
    )

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("messages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    emoji: Mapped[str] = mapped_column(String(16), primary_key=True)

    message: Mapped["Message"] = relationship(back_populates="reactions")
    user: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return f"<MessageReaction message={self.message_id} user={self.user_id} emoji={self.emoji!r}>"
