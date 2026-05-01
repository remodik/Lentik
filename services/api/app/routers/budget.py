from calendar import monthrange
from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.budget_transaction import (
    BudgetTransaction,
    BudgetTransactionSplit,
    BudgetTxType,
)
from app.models.membership import Membership
from app.models.user import User
from app.schemas.budget import (
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_INCOME_CATEGORIES,
    BudgetCategoriesResponse,
    BudgetCategoryBreakdown,
    BudgetMemberBalance,
    BudgetSplitInput,
    BudgetSplitResponse,
    BudgetSummaryResponse,
    BudgetTransactionCreate,
    BudgetTransactionResponse,
    BudgetTransactionUpdate,
)
from app.services.family import require_membership

family_router = APIRouter(prefix="/families/{family_id}/budget", tags=["budget"])
tx_router = APIRouter(prefix="/budget", tags=["budget"])

MONEY_QUANT = Decimal("0.01")


def _to_money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _tx_type_value(value) -> str:
    return value.value if isinstance(value, BudgetTxType) else value


def _to_response(tx: BudgetTransaction) -> BudgetTransactionResponse:
    return BudgetTransactionResponse(
        id=tx.id,
        family_id=tx.family_id,
        author_id=tx.author_id,
        author_name=tx.author.display_name if tx.author else None,
        paid_by=tx.paid_by,
        paid_by_name=tx.payer.display_name if tx.payer else None,
        type=_tx_type_value(tx.type),
        category=tx.category,
        amount=_to_money(tx.amount),
        currency=tx.currency,
        description=tx.description,
        occurred_on=tx.occurred_on,
        splits=[
            BudgetSplitResponse(
                user_id=split.user_id,
                user_name=split.user.display_name if split.user else None,
                share=_to_money(split.share),
            )
            for split in tx.splits
        ],
        created_at=tx.created_at,
    )


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    if not (1 <= month <= 12):
        raise HTTPException(status_code=400, detail="Invalid month")
    _, last_day = monthrange(year, month)
    return date(year, month, 1), date(year, month, last_day)


async def _family_user_ids(family_id: UUID, db: AsyncSession) -> set[UUID]:
    result = await db.scalars(
        select(Membership.user_id).where(Membership.family_id == family_id)
    )
    return set(result.all())


def _validate_splits(
    splits: list[BudgetSplitInput],
    amount: Decimal,
    family_user_ids: set[UUID],
) -> None:
    if not splits:
        return
    seen: set[UUID] = set()
    for s in splits:
        if s.user_id in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Split users must be unique",
            )
        seen.add(s.user_id)
        if s.user_id not in family_user_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="All split users must be family members",
            )
    total = sum((s.share for s in splits), start=Decimal("0"))
    if _to_money(total) != _to_money(amount):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Splits sum must equal amount",
        )


async def _load_tx(db: AsyncSession, tx_id: UUID) -> BudgetTransaction | None:
    return await db.scalar(
        select(BudgetTransaction)
        .where(BudgetTransaction.id == tx_id)
        .options(
            selectinload(BudgetTransaction.author),
            selectinload(BudgetTransaction.payer),
            selectinload(BudgetTransaction.splits).selectinload(
                BudgetTransactionSplit.user
            ),
        )
    )


@family_router.get("/categories", response_model=BudgetCategoriesResponse)
async def list_categories(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    rows = await db.execute(
        select(BudgetTransaction.type, BudgetTransaction.category)
        .where(BudgetTransaction.family_id == family_id)
        .distinct()
    )
    used_income: set[str] = set(DEFAULT_INCOME_CATEGORIES)
    used_expense: set[str] = set(DEFAULT_EXPENSE_CATEGORIES)
    for tx_type, cat in rows.all():
        if _tx_type_value(tx_type) == "income":
            used_income.add(cat)
        else:
            used_expense.add(cat)

    return BudgetCategoriesResponse(
        income=sorted(used_income),
        expense=sorted(used_expense),
    )


@family_router.get("/transactions", response_model=list[BudgetTransactionResponse])
async def list_transactions(
    family_id: UUID,
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    type: str | None = Query(default=None, pattern=r"^(income|expense)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    query = (
        select(BudgetTransaction)
        .where(BudgetTransaction.family_id == family_id)
        .options(
            selectinload(BudgetTransaction.author),
            selectinload(BudgetTransaction.payer),
            selectinload(BudgetTransaction.splits).selectinload(
                BudgetTransactionSplit.user
            ),
        )
        .order_by(
            BudgetTransaction.occurred_on.desc(),
            BudgetTransaction.created_at.desc(),
        )
    )

    if year and month:
        start, end = _month_bounds(year, month)
        query = query.where(
            BudgetTransaction.occurred_on >= start,
            BudgetTransaction.occurred_on <= end,
        )

    if type:
        query = query.where(BudgetTransaction.type == BudgetTxType(type))

    result = await db.scalars(query)
    return [_to_response(tx) for tx in result.all()]


@family_router.post(
    "/transactions",
    response_model=BudgetTransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_transaction(
    family_id: UUID,
    body: BudgetTransactionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    family_user_ids = await _family_user_ids(family_id, db)

    paid_by = body.paid_by
    if paid_by is not None and paid_by not in family_user_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payer must be a family member",
        )

    splits = body.splits or []
    if splits:
        _validate_splits(splits, body.amount, family_user_ids)
        # При наличии splits paid_by обязателен — иначе балансы не имеют смысла
        if paid_by is None:
            paid_by = user.id

    tx = BudgetTransaction(
        family_id=family_id,
        author_id=user.id,
        paid_by=paid_by,
        type=BudgetTxType(body.type),
        category=body.category.strip(),
        amount=_to_money(body.amount),
        currency=body.currency,
        description=body.description,
        occurred_on=body.occurred_on,
    )

    async with db.begin_nested():
        db.add(tx)
        await db.flush()
        if splits:
            db.add_all(
                [
                    BudgetTransactionSplit(
                        transaction_id=tx.id,
                        user_id=s.user_id,
                        share=_to_money(s.share),
                    )
                    for s in splits
                ]
            )

    await db.commit()

    loaded = await _load_tx(db, tx.id)
    if not loaded:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return _to_response(loaded)


@family_router.get("/summary", response_model=BudgetSummaryResponse)
async def month_summary(
    family_id: UUID,
    year: int = Query(ge=2000, le=2100),
    month: int = Query(ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)
    start, end = _month_bounds(year, month)

    rows = await db.execute(
        select(
            BudgetTransaction.type,
            BudgetTransaction.category,
            func.coalesce(func.sum(BudgetTransaction.amount), 0).label("total"),
            func.count(BudgetTransaction.id).label("count"),
        )
        .where(
            BudgetTransaction.family_id == family_id,
            BudgetTransaction.occurred_on >= start,
            BudgetTransaction.occurred_on <= end,
        )
        .group_by(BudgetTransaction.type, BudgetTransaction.category)
    )

    income: list[BudgetCategoryBreakdown] = []
    expense: list[BudgetCategoryBreakdown] = []
    total_income = Decimal("0")
    total_expense = Decimal("0")
    tx_count = 0
    for tx_type, category, total, count in rows.all():
        total_dec = Decimal(total) if not isinstance(total, Decimal) else total
        item = BudgetCategoryBreakdown(category=category, total=_to_money(total_dec))
        tx_count += int(count)
        if _tx_type_value(tx_type) == "income":
            income.append(item)
            total_income += total_dec
        else:
            expense.append(item)
            total_expense += total_dec

    income.sort(key=lambda c: c.total, reverse=True)
    expense.sort(key=lambda c: c.total, reverse=True)

    return BudgetSummaryResponse(
        year=year,
        month=month,
        total_income=_to_money(total_income),
        total_expense=_to_money(total_expense),
        balance=_to_money(total_income - total_expense),
        income_by_category=income,
        expense_by_category=expense,
        transaction_count=tx_count,
    )


@family_router.get("/balances", response_model=list[BudgetMemberBalance])
async def list_balances(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Балансы между участниками по транзакциям с splits.

    Транзакции без splits игнорируются (это личный учёт, не общий счёт).
    Учитываются и расходы, и доходы — в обоих случаях splits описывают,
    кто получил/должен соответствующую долю.
    """
    await require_membership(family_id, user, db)

    memberships = await db.scalars(
        select(Membership)
        .where(Membership.family_id == family_id)
        .options(selectinload(Membership.user))
    )
    members = memberships.all()
    member_ids = {m.user_id for m in members}

    balances: dict[UUID, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for m in members:
        balances[m.user_id] = Decimal("0.00")

    txs = await db.scalars(
        select(BudgetTransaction)
        .where(BudgetTransaction.family_id == family_id)
        .options(selectinload(BudgetTransaction.splits))
    )

    for tx in txs.all():
        if not tx.splits:
            continue
        if tx.paid_by is None:
            continue
        amount = _to_money(tx.amount)
        # Кто заплатил — тому "должны" amount
        if tx.paid_by in member_ids:
            balances[tx.paid_by] += amount
        # Каждому участнику доли — "должен" свою share
        for split in tx.splits:
            if split.user_id in member_ids:
                balances[split.user_id] -= _to_money(split.share)

    return [
        BudgetMemberBalance(
            user_id=m.user_id,
            display_name=m.user.display_name,
            balance=_to_money(balances[m.user_id]),
        )
        for m in members
    ]


@tx_router.get("/transactions/{tx_id}", response_model=BudgetTransactionResponse)
async def get_transaction(
    tx_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = await _load_tx(db, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await require_membership(tx.family_id, user, db)
    return _to_response(tx)


@tx_router.patch("/transactions/{tx_id}", response_model=BudgetTransactionResponse)
async def update_transaction(
    tx_id: UUID,
    body: BudgetTransactionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = await _load_tx(db, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    m = await require_membership(tx.family_id, user, db)
    if tx.author_id != user.id and m.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author or family owner can edit",
        )

    updated = body.model_fields_set
    family_user_ids = await _family_user_ids(tx.family_id, db)

    if "type" in updated and body.type is not None:
        tx.type = BudgetTxType(body.type)
    if "category" in updated and body.category is not None:
        tx.category = body.category.strip()
    if "amount" in updated and body.amount is not None:
        tx.amount = _to_money(body.amount)
    if "currency" in updated and body.currency is not None:
        tx.currency = body.currency
    if "description" in updated:
        tx.description = body.description
    if "occurred_on" in updated and body.occurred_on is not None:
        tx.occurred_on = body.occurred_on
    if "paid_by" in updated:
        if body.paid_by is not None and body.paid_by not in family_user_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payer must be a family member",
            )
        tx.paid_by = body.paid_by

    if "splits" in updated:
        new_splits = body.splits or []
        new_amount = tx.amount  # уже учли возможное обновление выше
        _validate_splits(new_splits, new_amount, family_user_ids)

        async with db.begin_nested():
            # Удаляем старые сплиты, чтобы не наткнуться на UNIQUE и на DEFERRED-триггер
            for old in list(tx.splits):
                await db.delete(old)
            await db.flush()
            for s in new_splits:
                db.add(
                    BudgetTransactionSplit(
                        transaction_id=tx.id,
                        user_id=s.user_id,
                        share=_to_money(s.share),
                    )
                )
            # Если splits добавили, а paid_by не задан — ставим автора
            if new_splits and tx.paid_by is None:
                tx.paid_by = user.id
    elif "amount" in updated and tx.splits:
        # Сумма изменилась, но splits не переданы — это нарушит триггер.
        # Требуем явно передать splits заново.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="When changing amount of a split transaction, splits must be re-supplied",
        )

    await db.commit()

    loaded = await _load_tx(db, tx.id)
    if not loaded:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return _to_response(loaded)


@tx_router.delete("/transactions/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    tx_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = await db.get(BudgetTransaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    m = await require_membership(tx.family_id, user, db)
    if tx.author_id != user.id and m.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the author or family owner can delete",
        )

    await db.delete(tx)
    await db.commit()
