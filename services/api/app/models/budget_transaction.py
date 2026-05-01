import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class BudgetTxType(str, enum.Enum):
    INCOME = "income"
    EXPENSE = "expense"


class BudgetTransaction(Base):
    __tablename__ = "budget_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    paid_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    type: Mapped[BudgetTxType] = mapped_column(
        Enum(
            BudgetTxType,
            name="budget_tx_type",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
        default="RUB",
        server_default=text("'RUB'"),
    )
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    author: Mapped["User"] = relationship(foreign_keys=[author_id])
    payer: Mapped["User"] = relationship(foreign_keys=[paid_by])
    splits: Mapped[list["BudgetTransactionSplit"]] = relationship(
        back_populates="transaction",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<BudgetTransaction {self.type} {self.amount} {self.category}>"


class BudgetTransactionSplit(Base):
    __tablename__ = "budget_transaction_splits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("budget_transactions.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    share: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    transaction: Mapped["BudgetTransaction"] = relationship(back_populates="splits")
    user: Mapped["User"] = relationship()

    def __repr__(self) -> str:
        return (
            f"<BudgetTransactionSplit tx={self.transaction_id} "
            f"user={self.user_id} share={self.share}>"
        )
