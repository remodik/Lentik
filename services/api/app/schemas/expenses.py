from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

MONEY_QUANT = Decimal("0.01")


def _to_money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


class ExpenseSplitSchema(BaseModel):
    user_id: UUID
    share: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    user_display_name: str | None = None

    @field_validator("share")
    @classmethod
    def validate_share(cls, value: Decimal) -> Decimal:
        return _to_money(value)


class ExpenseCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    currency: str = Field(default="RUB", min_length=1, max_length=8)
    paid_by: UUID
    splits: list[ExpenseSplitSchema] = Field(min_length=1)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Title must not be empty")
        return title

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        currency = value.strip().upper()
        if not currency:
            raise ValueError("Currency must not be empty")
        return currency

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: Decimal) -> Decimal:
        return _to_money(value)

    @model_validator(mode="after")
    def validate_splits_sum(self) -> "ExpenseCreateRequest":
        total = sum((split.share for split in self.splits), start=Decimal("0"))
        if _to_money(total) != self.amount:
            raise ValueError("Splits sum must equal amount")
        return self


class ExpenseResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID
    created_by: UUID
    created_by_name: str | None = None
    title: str
    amount: Decimal
    currency: str
    paid_by: UUID
    paid_by_name: str | None = None
    splits: list[ExpenseSplitSchema]
    created_at: datetime
    updated_at: datetime


class BalanceResponse(BaseModel):
    user_id: UUID
    display_name: str
    balance: Decimal
