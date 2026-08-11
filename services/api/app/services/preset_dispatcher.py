"""Шедулер пресет-ботов (трек D).

Каждые N секунд опрашивает `preset_bots`, находит включённые пресеты, у которых
«час пробил» и которые ещё не отработали сегодня (по локальному tz), зовёт их
хендлер и постит результат в целевой чат от имени бот-личности. Дедуп — через
`last_run_at`; при нескольких инстансах строки берутся под `SKIP LOCKED`, поэтому
каждый пресет отрабатывает ровно один раз в день без leader-election.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.message import Message
from app.models.preset_bot import PresetBot
from app.services.preset_bots import PRESET_HANDLERS, local_now, to_local
from app.ws.manager import ws_manager

logger = logging.getLogger(__name__)

_POLL_INTERVAL_SECONDS = 60
_scheduler_task: asyncio.Task[None] | None = None
_scheduler_stop: asyncio.Event | None = None
_dispatch_lock = asyncio.Lock()


def _is_due(pb: PresetBot) -> bool:
    config = pb.config or {}
    now_local = local_now(config)
    hour = int(config.get("hour", 9))
    if now_local.hour < hour:
        return False
    if pb.last_run_at is not None:
        if to_local(pb.last_run_at, config).date() >= now_local.date():
            return False
    return True


def _new_message_payload(msg: Message, bot_user) -> dict:
    return {
        "type": "new_message",
        "message": {
            "id": str(msg.id),
            "chat_id": str(msg.chat_id),
            "author_id": str(bot_user.id),
            "author_username": bot_user.username,
            "author_display_name": bot_user.display_name,
            "text": msg.text,
            "edited": False,
            "reply_to_id": None,
            "mentions": [],
            "attachments": [],
            "components": [],
            "reactions": [],
            "readers": [],
            "created_at": msg.created_at.isoformat(),
        },
    }


async def dispatch_due_presets() -> int:
    async with _dispatch_lock:
        async with AsyncSessionLocal() as db:
            result = await db.scalars(
                select(PresetBot)
                .where(
                    PresetBot.enabled == True,  # noqa: E712
                    PresetBot.target_chat_id.is_not(None),
                )
                .options(selectinload(PresetBot.bot_user))
                .with_for_update(skip_locked=True)
            )
            presets = [pb for pb in result.all() if _is_due(pb)]
            if not presets:
                return 0

            posted: list[tuple[Message, object]] = []
            for pb in presets:
                handler = PRESET_HANDLERS.get(pb.preset_key)
                if handler is None:
                    continue
                try:
                    text = await handler(db, pb.family_id, pb.config or {})
                except Exception:
                    logger.exception("preset %s handler failed", pb.preset_key)
                    # не трогаем last_run_at → повтор на следующем тике
                    continue

                # Отметить прогон даже если постить нечего (text is None),
                # чтобы не гонять хендлер весь день.
                pb.last_run_at = datetime.now(timezone.utc)

                if text:
                    msg = Message(
                        chat_id=pb.target_chat_id,
                        author_id=pb.bot_user_id,
                        text=text,
                    )
                    db.add(msg)
                    posted.append((msg, pb.bot_user))

            await db.commit()

            sent = 0
            for msg, bot_user in posted:
                await db.refresh(msg, ["created_at"])
                await ws_manager.broadcast_to_chat(
                    msg.chat_id, _new_message_payload(msg, bot_user)
                )
                sent += 1
            return sent


async def _scheduler_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await dispatch_due_presets()
        except Exception:
            logger.exception("preset dispatch tick failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=_POLL_INTERVAL_SECONDS)
        except asyncio.TimeoutError:
            continue


async def start_preset_scheduler() -> None:
    global _scheduler_task, _scheduler_stop
    if _scheduler_task and not _scheduler_task.done():
        return
    _scheduler_stop = asyncio.Event()
    _scheduler_task = asyncio.create_task(
        _scheduler_loop(_scheduler_stop), name="preset-scheduler"
    )
    logger.info("preset scheduler started")


async def stop_preset_scheduler() -> None:
    global _scheduler_task, _scheduler_stop
    if not _scheduler_task:
        return
    if _scheduler_stop:
        _scheduler_stop.set()
    try:
        await _scheduler_task
    except Exception:
        logger.exception("preset scheduler stopped with error")
    _scheduler_task = None
    _scheduler_stop = None
    logger.info("preset scheduler stopped")
