import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, Float, ForeignKey, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class TreeGender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    UNKNOWN = "unknown"


class TreeRelationType(str, enum.Enum):
    PARENT = "parent"
    SPOUSE = "spouse"


class FamilyTreePerson(Base):
    __tablename__ = "family_tree_persons"
    __table_args__ = (
        UniqueConstraint("family_id", "user_id", name="uq_tree_family_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    gender: Mapped[TreeGender] = mapped_column(
        Enum(
            TreeGender,
            name="family_tree_gender",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=TreeGender.UNKNOWN,
        server_default=text("'unknown'"),
    )
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    death_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    pos_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    pos_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(lazy="joined")

    def __repr__(self) -> str:
        return f"<FamilyTreePerson {self.display_name!r}>"


class FamilyTreeRelation(Base):
    __tablename__ = "family_tree_relations"
    __table_args__ = (
        UniqueConstraint(
            "family_id",
            "person_a_id",
            "person_b_id",
            "relation_type",
            name="uq_tree_relation",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_a_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("family_tree_persons.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_b_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("family_tree_persons.id", ondelete="CASCADE"),
        nullable=False,
    )
    relation_type: Mapped[TreeRelationType] = mapped_column(
        Enum(
            TreeRelationType,
            name="family_tree_relation_type",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return (
            f"<FamilyTreeRelation {self.relation_type} "
            f"a={self.person_a_id} b={self.person_b_id}>"
        )
