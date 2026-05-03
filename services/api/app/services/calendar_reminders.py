import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.calendar_event import CalendarEvent
from app.ws.manager import ws_manager

logger = logging.getLogger(__name__)

_POLL_INTERVAL_SECONDS = 15
_MAX_REMINDER_MINUTES = 60 * 24 * 30  # 30 days
_scheduler_task: asyncio.Task[None] | None = None
_scheduler_stop: asyncio.Event | None = None
_dispatch_lock = asyncio.Lock()


def _format_reminder_offset(minutes: int) -> str:
    if minutes % 1440 == 0:
        days = minutes // 1440
        return f"за {days} дн."
    if minutes % 60 == 0:
        hours = minutes // 60
        return f"за {hours} ч"
    return f"за {minutes} мин"


async def dispatch_due_calendar_reminders() -> int:
    async with _dispatch_lock:
        now = datetime.now(timezone.utc)
        horizon = now + timedelta(minutes=_MAX_REMINDER_MINUTES + 1)

        async with AsyncSessionLocal() as db:
            result = await db.scalars(
                select(CalendarEvent)
                .where(
                    CalendarEvent.reminder_minutes.is_not(None),
                    CalendarEvent.reminder_sent_at.is_(None),
                    CalendarEvent.starts_at <= horizon,
                )
                .options(selectinload(CalendarEvent.creator))
                .order_by(CalendarEvent.starts_at.asc())
                .limit(200)
            )
            events = result.all()

            if not events:
                return 0

            sent_at = datetime.now(timezone.utc)
            sent_count = 0

            for event in events:
                reminder_minutes = event.reminder_minutes
                if reminder_minutes is None:
                    continue

                remind_at = event.starts_at - timedelta(minutes=reminder_minutes)
                if remind_at > now:
                    continue

                await ws_manager.broadcast_to_family(
                    event.family_id,
                    {
                        "type": "calendar_reminder",
                        "family_id": str(event.family_id),
                        "event_id": str(event.id),
                        "title": event.title,
                        "starts_at": event.starts_at.isoformat(),
                        "reminder_minutes": reminder_minutes,
                        "offset_label": _format_reminder_offset(reminder_minutes),
                    },
                )
                event.reminder_sent_at = sent_at
                sent_count += 1

            if sent_count > 0:
                await db.commit()

            return sent_count


async def _scheduler_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await dispatch_due_calendar_reminders()
        except Exception:
            logger.exception("calendar reminder dispatch tick failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=_POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue


async def start_calendar_reminder_scheduler() -> None:
    global _scheduler_task, _scheduler_stop

    if _scheduler_task and not _scheduler_task.done():
        return

    _scheduler_stop = asyncio.Event()
    _scheduler_task = asyncio.create_task(
        _scheduler_loop(_scheduler_stop),
        name="calendar-reminder-scheduler",
    )
    logger.info("calendar reminder scheduler started")


async def stop_calendar_reminder_scheduler() -> None:
    global _scheduler_task, _scheduler_stop

    if not _scheduler_task:
        return

    if _scheduler_stop:
        _scheduler_stop.set()

    try:
        await _scheduler_task
    except Exception:
        logger.exception("calendar reminder scheduler stopped with error")

    _scheduler_task = None
    _scheduler_stop = None
    logger.info("calendar reminder scheduler stopped")
