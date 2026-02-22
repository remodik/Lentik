import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Family(Base):
    __tablename__ = "families"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="family", cascade="all, delete-orphan"
    )
    invites: Mapped[list["Invite"]] = relationship(
        back_populates="family", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Family {self.name!r}>"