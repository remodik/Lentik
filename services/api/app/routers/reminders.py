from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.core.permissions import Perm, has_perm
from app.db.deps import get_db
from app.models.membership import Membership
from app.models.reminder import Reminder, RepeatRule
from app.models.user import User
from app.schemas.reminders import (
    ReminderCreate,
    ReminderResponse,
    ReminderToggleDoneResponse,
    ReminderUpdate,
)
from app.services.audit import log_action
from app.services.family import require_membership
from app.services.roles import effective_permissions


async def _ensure_can_modify_reminder(
    r: Reminder, user: User, db: AsyncSession
) -> Membership | None:
    """Автор может всегда. Чужое напоминание — owner или MANAGE_REMINDERS (и
    только если оно принадлежит семье). Возвращает membership модератора для
    логирования, иначе None.
    """
    is_own = r.author_id == user.id

    if r.family_id is None:
        if not is_own:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Напоминание вам не принадлежит",
            )
        return None

    m = await require_membership(r.family_id, user, db)
    if is_own:
        return None

    if m.role.value != "owner":
        bits = await effective_permissions(db, m.id)
        if not has_perm(bits, Perm.MANAGE_REMINDERS):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав для изменения чужих напоминаний",
            )
    return m

family_router = APIRouter(prefix="/families/{family_id}/reminders", tags=["reminders"])
reminder_router = APIRouter(prefix="/reminders", tags=["reminders"])


def _repeat_value(value) -> str:
    return value.value if isinstance(value, RepeatRule) else value


def _to_response(r: Reminder) -> ReminderResponse:
    return ReminderResponse(
        id=r.id,
        family_id=r.family_id,
        author_id=r.author_id,
        author_name=r.author.display_name if r.author else None,
        title=r.title,
        notes=r.notes,
        remind_at=r.remind_at,
        is_personal=r.is_personal,
        repeat_rule=_repeat_value(r.repeat_rule),
        is_done=r.is_done,
        reminder_sent_at=r.reminder_sent_at,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


def _next_occurrence(remind_at: datetime, rule: RepeatRule | str) -> datetime | None:
    """Возвращает следующее время срабатывания для повторяющегося напоминания."""
    rule_value = _repeat_value(rule)
    now = datetime.now(timezone.utc)

    def _bump(value: datetime) -> datetime:
        if rule_value == "daily":
            return value + timedelta(days=1)
        if rule_value == "weekly":
            return value + timedelta(weeks=1)
        if rule_value == "monthly":
            year = value.year + (value.month // 12)
            month = (value.month % 12) + 1
            day = value.day
            # обработка короткого месяца
            from calendar import monthrange
            _, last_day = monthrange(year, month)
            day = min(day, last_day)
            return value.replace(year=year, month=month, day=day)
        return value

    if rule_value == "none":
        return None

    nxt = _bump(remind_at)
    # Если получившееся время всё ещё в прошлом (давно не открывали),
    # прогоняем дальше пока не догоним now.
    while nxt <= now:
        nxt_new = _bump(nxt)
        if nxt_new == nxt:
            break
        nxt = nxt_new
    return nxt


@family_router.get("", response_model=list[ReminderResponse])
async def list_reminders(
    family_id: UUID,
    upcoming: bool = Query(default=False, description="Показывать только активные/будущие"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    query = (
        select(Reminder)
        .where(
            Reminder.family_id == family_id,
            or_(
                Reminder.is_personal == False,  # noqa: E712
                Reminder.author_id == user.id,
            ),
        )
        .options(selectinload(Reminder.author))
        .order_by(Reminder.remind_at.asc())
    )

    if upcoming:
        query = query.where(Reminder.is_done == False)  # noqa: E712

    result = await db.scalars(query)
    return [_to_response(r) for r in result.all()]


@family_router.post(
    "",
    response_model=ReminderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_reminder(
    family_id: UUID,
    body: ReminderCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)

    reminder = Reminder(
        family_id=family_id,
        author_id=user.id,
        title=body.title,
        notes=body.notes,
        remind_at=body.remind_at,
        is_personal=body.is_personal,
        repeat_rule=RepeatRule(body.repeat_rule),
        is_done=False,
        reminder_sent_at=None,
    )
    db.add(reminder)
    await db.flush()
    await db.refresh(reminder, ["author"])
    await db.commit()
    return _to_response(reminder)


@reminder_router.get("/{reminder_id}", response_model=ReminderResponse)
async def get_reminder(
    reminder_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.scalar(
        select(Reminder)
        .where(Reminder.id == reminder_id)
        .options(selectinload(Reminder.author))
    )
    if not r:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if r.family_id is not None:
        await require_membership(r.family_id, user, db)
    if r.is_personal and r.author_id != user.id:
        raise HTTPException(status_code=403, detail="Personal reminder is not yours")
    return _to_response(r)


@reminder_router.patch("/{reminder_id}", response_model=ReminderResponse)
async def update_reminder(
    reminder_id: UUID,
    body: ReminderUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.scalar(
        select(Reminder)
        .where(Reminder.id == reminder_id)
        .options(selectinload(Reminder.author))
    )
    if not r:
        raise HTTPException(status_code=404, detail="Reminder not found")

    moderator = await _ensure_can_modify_reminder(r, user, db)

    updated = body.model_fields_set
    reset_dispatch = False

    if "title" in updated and body.title is not None:
        r.title = body.title
    if "notes" in updated:
        r.notes = body.notes
    if "remind_at" in updated and body.remind_at is not None:
        if r.remind_at != body.remind_at:
            reset_dispatch = True
        r.remind_at = body.remind_at
    if "is_personal" in updated and body.is_personal is not None:
        r.is_personal = body.is_personal
    if "repeat_rule" in updated and body.repeat_rule is not None:
        r.repeat_rule = RepeatRule(body.repeat_rule)
    if "is_done" in updated and body.is_done is not None:
        r.is_done = body.is_done

    if reset_dispatch:
        r.reminder_sent_at = None

    if moderator is not None and r.family_id is not None:
        author = await db.get(User, r.author_id) if r.author_id else None
        await log_action(
            db,
            family_id=r.family_id,
            actor_id=user.id,
            action="reminder.edited_by_moderator",
            target_type="reminder",
            target_id=r.id,
            metadata={
                "title": r.title,
                "author_name": author.display_name if author else None,
            },
        )

    await db.commit()
    await db.refresh(r, ["author"])
    return _to_response(r)


@reminder_router.post(
    "/{reminder_id}/toggle-done",
    response_model=ReminderToggleDoneResponse,
)
async def toggle_done(
    reminder_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Отмечает напоминание выполненным.

    Для повторяющихся напоминаний вместо «выполнено» переносит remind_at
    на следующий период и сбрасывает reminder_sent_at, чтобы шедулер сработал снова.
    """
    r = await db.get(Reminder, reminder_id)
    if not r:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if r.family_id is not None:
        await require_membership(r.family_id, user, db)
    if r.is_personal and r.author_id != user.id:
        raise HTTPException(status_code=403, detail="Personal reminder is not yours")

    rule_value = _repeat_value(r.repeat_rule)
    next_at: datetime | None = None

    if rule_value != "none" and not r.is_done:
        next_at = _next_occurrence(r.remind_at, r.repeat_rule)
        if next_at is not None:
            r.remind_at = next_at
            r.reminder_sent_at = None
            r.is_done = False
        else:
            r.is_done = True
    else:
        r.is_done = not r.is_done

    await db.commit()
    return ReminderToggleDoneResponse(
        id=r.id,
        is_done=r.is_done,
        next_remind_at=next_at,
    )


@reminder_router.delete(
    "/{reminder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_reminder(
    reminder_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.get(Reminder, reminder_id)
    if not r:
        raise HTTPException(status_code=404, detail="Reminder not found")

    moderator = await _ensure_can_modify_reminder(r, user, db)

    if moderator is not None and r.family_id is not None:
        author = await db.get(User, r.author_id) if r.author_id else None
        await log_action(
            db,
            family_id=r.family_id,
            actor_id=user.id,
            action="reminder.deleted_by_moderator",
            target_type="reminder",
            target_id=r.id,
            metadata={
                "title": r.title,
                "author_name": author.display_name if author else None,
            },
        )

    await db.delete(r)
    await db.commit()
