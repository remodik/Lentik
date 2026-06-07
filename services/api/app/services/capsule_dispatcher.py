"""Шедулер авто-открытия капсул времени.

Каждые N секунд находит капсулы с ``unlock_at <= now`` и ``opened = false``,
помечает открытыми и рассылает семье WS-событие ``capsule_opened``.
Корректность доступа НЕ зависит от этого шедулера (гейт в роутере считается от
``unlock_at`` vs ``now``) — шедулер нужен только для уведомления-«та-да».
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.time_capsule import TimeCapsule
from app.ws.manager import ws_manager

logger = logging.getLogger(__name__)

_POLL_INTERVAL_SECONDS = 30
_scheduler_task: asyncio.Task[None] | None = None
_scheduler_stop: asyncio.Event | None = None
_lock = asyncio.Lock()


async def dispatch_opened_capsules() -> int:
    async with _lock:
        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as db:
            capsules = (
                await db.scalars(
                    select(TimeCapsule)
                    .where(
                        TimeCapsule.opened == False,  # noqa: E712
                        TimeCapsule.unlock_at <= now,
                    )
                    .order_by(TimeCapsule.unlock_at.asc())
                    .limit(200)
                    # Несколько воркеров безопасны: каждую капсулу обрабатывает
                    # ровно один (SKIP LOCKED).
                    .with_for_update(skip_locked=True)
                )
            ).all()

            if not capsules:
                return 0

            for c in capsules:
                c.opened = True
                await ws_manager.broadcast_to_family(
                    c.family_id,
                    {
                        "type": "capsule_opened",
                        "capsule_id": str(c.id),
                        "title": c.title,
                    },
                )
            await db.commit()
            return len(capsules)


async def _scheduler_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await dispatch_opened_capsules()
        except Exception:
            logger.exception("capsule dispatch tick failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=_POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue


async def start_capsule_scheduler() -> None:
    global _scheduler_task, _scheduler_stop
    if _scheduler_task and not _scheduler_task.done():
        return
    _scheduler_stop = asyncio.Event()
    _scheduler_task = asyncio.create_task(
        _scheduler_loop(_scheduler_stop), name="capsule-scheduler"
    )
    logger.info("capsule scheduler started")


async def stop_capsule_scheduler() -> None:
    global _scheduler_task, _scheduler_stop
    if not _scheduler_task:
        return
    if _scheduler_stop:
        _scheduler_stop.set()
    try:
        await _scheduler_task
    except Exception:
        logger.exception("capsule scheduler stopped with error")
    _scheduler_task = None
    _scheduler_stop = None
    logger.info("capsule scheduler stopped")
