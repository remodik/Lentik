from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

BudgetType = Literal["income", "expense"]
MONEY_QUANT = Decimal("0.01")


def _to_money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


DEFAULT_INCOME_CATEGORIES = [
    "salary",
    "pension",
    "gift",
    "other_income",
]

DEFAULT_EXPENSE_CATEGORIES = [
    "groceries",
    "utilities",
    "transport",
    "health",
    "entertainment",
    "education",
    "clothing",
    "household",
    "other_expense",
]


class BudgetSplitInput(BaseModel):
    user_id: UUID
    share: Decimal = Field(gt=0, max_digits=14, decimal_places=2)

    @field_validator("share")
    @classmethod
    def quantize_share(cls, value: Decimal) -> Decimal:
        return _to_money(value)


class BudgetSplitResponse(BaseModel):
    user_id: UUID
    user_name: str | None = None
    share: Decimal


class BudgetTransactionCreate(BaseModel):
    type: BudgetType
    category: str = Field(min_length=1, max_length=50)
    amount: Decimal = Field(gt=Decimal("0"), max_digits=14, decimal_places=2)
    currency: str = Field(default="RUB", min_length=1, max_length=8)
    description: str | None = Field(default=None, max_length=300)
    occurred_on: date
    paid_by: UUID | None = None
    splits: list[BudgetSplitInput] | None = None

    @field_validator("amount")
    @classmethod
    def quantize_amount(cls, value: Decimal) -> Decimal:
        return _to_money(value)

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        cur = value.strip().upper()
        if not cur:
            raise ValueError("Currency must not be empty")
        return cur

    @model_validator(mode="after")
    def validate_splits(self) -> "BudgetTransactionCreate":
        if self.splits:
            total = sum((s.share for s in self.splits), start=Decimal("0"))
            if _to_money(total) != self.amount:
                raise ValueError("Splits sum must equal amount")
            seen: set[UUID] = set()
            for s in self.splits:
                if s.user_id in seen:
                    raise ValueError("Duplicate user in splits")
                seen.add(s.user_id)
        return self


class BudgetTransactionUpdate(BaseModel):
    type: BudgetType | None = None
    category: str | None = Field(default=None, min_length=1, max_length=50)
    amount: Decimal | None = Field(
        default=None, gt=Decimal("0"), max_digits=14, decimal_places=2
    )
    currency: str | None = Field(default=None, min_length=1, max_length=8)
    description: str | None = Field(default=None, max_length=300)
    occurred_on: date | None = None
    paid_by: UUID | None = None
    splits: list[BudgetSplitInput] | None = None

    @field_validator("amount")
    @classmethod
    def quantize_amount(cls, value: Decimal | None) -> Decimal | None:
        return _to_money(value) if value is not None else None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cur = value.strip().upper()
        if not cur:
            raise ValueError("Currency must not be empty")
        return cur


class BudgetTransactionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID
    author_id: UUID | None
    author_name: str | None = None
    paid_by: UUID | None = None
    paid_by_name: str | None = None
    type: BudgetType
    category: str
    amount: Decimal
    currency: str
    description: str | None
    occurred_on: date
    splits: list[BudgetSplitResponse] = []
    created_at: datetime


class BudgetCategoryBreakdown(BaseModel):
    category: str
    total: Decimal


class BudgetSummaryResponse(BaseModel):
    year: int
    month: int
    total_income: Decimal
    total_expense: Decimal
    balance: Decimal
    income_by_category: list[BudgetCategoryBreakdown]
    expense_by_category: list[BudgetCategoryBreakdown]
    transaction_count: int


class BudgetCategoriesResponse(BaseModel):
    income: list[str]
    expense: list[str]


class BudgetMemberBalance(BaseModel):
    """Баланс участника по общим тратам (со splits).

    balance > 0 — другим должны вернуть пользователю
    balance < 0 — пользователь должен вернуть другим
    """
    user_id: UUID
    display_name: str
    balance: Decimal
