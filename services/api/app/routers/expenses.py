from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.expense import Expense, ExpenseSplit
from app.models.membership import Membership
from app.models.user import User
from app.schemas.expenses import (
    BalanceResponse,
    ExpenseCreateRequest,
    ExpenseResponse,
    ExpenseSplitSchema,
)
from app.services.family import require_membership
from app.ws.manager import ws_manager

router = APIRouter(prefix="/families/{family_id}/expenses", tags=["expenses"])

MONEY_QUANT = Decimal("0.01")


def _to_money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


async def _load_expense(
    db: AsyncSession,
    family_id: UUID,
    expense_id: UUID,
) -> Expense | None:
    return await db.scalar(
        select(Expense)
        .where(Expense.id == expense_id, Expense.family_id == family_id)
        .options(
            selectinload(Expense.payer),
            selectinload(Expense.creator),
            selectinload(Expense.splits).selectinload(ExpenseSplit.user),
        )
    )


def _to_expense_response(expense: Expense) -> ExpenseResponse:
    return ExpenseResponse(
        id=expense.id,
        family_id=expense.family_id,
        created_by=expense.created_by,
        created_by_name=expense.creator.display_name if expense.creator else None,
        title=expense.title,
        amount=_to_money(expense.amount),
        currency=expense.currency,
        paid_by=expense.paid_by,
        paid_by_name=expense.payer.display_name if expense.payer else None,
        splits=[
            ExpenseSplitSchema(
                user_id=split.user_id,
                share=_to_money(split.share),
                user_display_name=split.user.display_name if split.user else None,
            )
            for split in expense.splits
        ],
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    family_id: UUID,
    body: ExpenseCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    memberships = await db.scalars(
        select(Membership).where(Membership.family_id == family_id)
    )
    family_user_ids = {member.user_id for member in memberships.all()}

    if body.paid_by not in family_user_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payer must be a family member",
        )

    split_user_ids = [split.user_id for split in body.splits]
    if len(split_user_ids) != len(set(split_user_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Split users must be unique",
        )

    if any(user_id not in family_user_ids for user_id in split_user_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All split users must be family members",
        )

    splits_sum = sum((split.share for split in body.splits), start=Decimal("0"))
    if _to_money(splits_sum) != _to_money(body.amount):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Splits sum must equal amount",
        )

    expense = Expense(
        family_id=family_id,
        created_by=user.id,
        title=body.title,
        amount=_to_money(body.amount),
        currency=body.currency,
        paid_by=body.paid_by,
    )

    async with db.begin_nested():
        db.add(expense)
        await db.flush()
        db.add_all(
            [
                ExpenseSplit(
                    expense_id=expense.id,
                    user_id=split.user_id,
                    share=_to_money(split.share),
                )
                for split in body.splits
            ]
        )

    await db.commit()

    created_expense = await _load_expense(db, family_id, expense.id)
    if not created_expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    await ws_manager.broadcast_to_family(
        family_id,
        {
            "type": "expense_created",
            "family_id": str(family_id),
            "expense_id": str(created_expense.id),
        },
    )

    return _to_expense_response(created_expense)


@router.get("", response_model=list[ExpenseResponse])
async def list_expenses(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    expenses = await db.scalars(
        select(Expense)
        .where(Expense.family_id == family_id)
        .options(
            selectinload(Expense.payer),
            selectinload(Expense.creator),
            selectinload(Expense.splits).selectinload(ExpenseSplit.user),
        )
        .order_by(Expense.created_at.desc())
    )
    return [_to_expense_response(expense) for expense in expenses.all()]


@router.get("/balance", response_model=list[BalanceResponse])
async def get_balances(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    memberships = await db.scalars(
        select(Membership)
        .where(Membership.family_id == family_id)
        .options(selectinload(Membership.user))
    )
    family_memberships = memberships.all()

    balances: dict[UUID, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for membership in family_memberships:
        balances[membership.user_id] = Decimal("0.00")

    expenses = await db.scalars(
        select(Expense)
        .where(Expense.family_id == family_id)
        .options(selectinload(Expense.splits))
    )

    for expense in expenses.all():
        balances[expense.paid_by] += _to_money(expense.amount)
        for split in expense.splits:
            balances[split.user_id] -= _to_money(split.share)

    return [
        BalanceResponse(
            user_id=membership.user_id,
            display_name=membership.user.display_name,
            balance=_to_money(balances[membership.user_id]),
        )
        for membership in family_memberships
    ]
