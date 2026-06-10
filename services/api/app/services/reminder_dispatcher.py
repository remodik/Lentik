"""Шедулер рассылки напоминаний (Reminder).

Каждые N секунд опрашивает таблицу `reminders`, выбирает все записи с
`remind_at <= now()` и `reminder_sent_at IS NULL` и `is_done = false`,
рассылает WS-уведомление в семейный канал, после чего:

* для одноразового напоминания (`repeat_rule == 'none'`) — фиксирует
  `reminder_sent_at = now()`;
* для повторяющегося — переносит `remind_at` на следующий период,
  сбрасывает `reminder_sent_at`, чтобы оно сработало снова в будущем.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.reminder import Reminder, RepeatRule
from app.services.push import recipients_for_family, send_push_to_users
from app.ws.manager import ws_manager

logger = logging.getLogger(__name__)

_POLL_INTERVAL_SECONDS = 15
_scheduler_task: asyncio.Task[None] | None = None
_scheduler_stop: asyncio.Event | None = None
_dispatch_lock = asyncio.Lock()


def _repeat_value(value) -> str:
    return value.value if isinstance(value, RepeatRule) else value


def _next_occurrence(remind_at: datetime, rule) -> datetime | None:
    rule_value = _repeat_value(rule)
    if rule_value == "none":
        return None

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
            from calendar import monthrange
            _, last_day = monthrange(year, month)
            day = min(day, last_day)
            return value.replace(year=year, month=month, day=day)
        return value

    nxt = _bump(remind_at)
    while nxt <= now:
        nxt_new = _bump(nxt)
        if nxt_new == nxt:
            break
        nxt = nxt_new
    return nxt


async def _push_reminder(db, r: Reminder) -> None:
    """Web Push по напоминанию. Личное (или без семьи) — только автору,
    семейное — всем участникам. Ошибки не пробрасываем."""
    if r.family_id is None or r.is_personal:
        recipients = [r.author_id] if r.author_id else []
    else:
        recipients = await recipients_for_family(db, r.family_id)
    if not recipients:
        return
    try:
        await send_push_to_users(
            recipients,
            {
                "title": "Напоминание",
                "body": r.title,
                "tag": f"reminder-{r.id}",
                "url": "/",
            },
        )
    except Exception:
        logger.exception("reminder push failed")


async def dispatch_due_reminders() -> int:
    async with _dispatch_lock:
        now = datetime.now(timezone.utc)

        async with AsyncSessionLocal() as db:
            result = await db.scalars(
                select(Reminder)
                .where(
                    Reminder.is_done == False,  # noqa: E712
                    Reminder.reminder_sent_at.is_(None),
                    Reminder.remind_at <= now,
                )
                .options(selectinload(Reminder.author))
                .order_by(Reminder.remind_at.asc())
                .limit(200)
                # P2: при нескольких инстансах строки блокируются за выбравшим
                # их воркером, остальные их пропускают (SKIP LOCKED) — каждое
                # напоминание уходит ровно один раз, без leader-election.
                .with_for_update(skip_locked=True)
            )
            reminders = result.all()

            if not reminders:
                return 0

            sent_at = datetime.now(timezone.utc)
            sent_count = 0

            for r in reminders:
                payload = {
                    "type": "reminder",
                    "family_id": str(r.family_id) if r.family_id else None,
                    "reminder_id": str(r.id),
                    "title": r.title,
                    "remind_at": r.remind_at.isoformat(),
                    "is_personal": r.is_personal,
                    "author_id": str(r.author_id) if r.author_id else None,
                    "author_name": r.author.display_name if r.author else None,
                    "repeat_rule": _repeat_value(r.repeat_rule),
                }

                # Доставка в реальном времени (WS).
                if r.family_id is not None:
                    await ws_manager.broadcast_to_family(r.family_id, payload)
                elif r.author_id is not None:
                    # Личное напоминание без семьи — раньше молча терялось
                    # (не было канала рассылки). Теперь шлём автору лично.
                    await ws_manager.broadcast_to_user(r.author_id, payload)

                # Доставка вне приложения (Web Push), best-effort.
                await _push_reminder(db, r)

                rule_value = _repeat_value(r.repeat_rule)
                if rule_value == "none":
                    r.reminder_sent_at = sent_at
                else:
                    next_at = _next_occurrence(r.remind_at, r.repeat_rule)
                    if next_at is not None:
                        r.remind_at = next_at
                        r.reminder_sent_at = None
                    else:
                        r.reminder_sent_at = sent_at
                sent_count += 1

            if sent_count > 0:
                await db.commit()

            return sent_count


async def _scheduler_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await dispatch_due_reminders()
        except Exception:
            logger.exception("reminder dispatch tick failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=_POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue


async def start_reminder_scheduler() -> None:
    global _scheduler_task, _scheduler_stop

    if _scheduler_task and not _scheduler_task.done():
        return

    _scheduler_stop = asyncio.Event()
    _scheduler_task = asyncio.create_task(
        _scheduler_loop(_scheduler_stop),
        name="reminder-scheduler",
    )
    logger.info("reminder scheduler started")


async def stop_reminder_scheduler() -> None:
    global _scheduler_task, _scheduler_stop

    if not _scheduler_task:
        return

    if _scheduler_stop:
        _scheduler_stop.set()

    try:
        await _scheduler_task
    except Exception:
        logger.exception("reminder scheduler stopped with error")

    _scheduler_task = None
    _scheduler_stop = None
    logger.info("reminder scheduler stopped")
