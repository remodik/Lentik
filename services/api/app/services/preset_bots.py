"""Реестр «готовых» пресет-ботов (трек D) и их обработчики.

Пресет — это встроенный бот, который постит по расписанию. Метаданные описывают
его для UI и дефолтную настройку; хендлер (`(db, family_id, config) -> str|None`)
собирает текст поста на сегодня. `None` означает «сегодня постить нечего» — тик
всё равно фиксируется (`last_run_at`), чтобы не гонять хендлер весь день.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Awaitable, Callable
from uuid import UUID

from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar_event import CalendarEvent
from app.models.membership import Membership
from app.models.user import User

_DEFAULT_TZ_OFFSET_MIN = 180  # МСК (UTC+3)


@dataclass(frozen=True)
class PresetMeta:
    key: str
    title: str
    description: str
    default_display_name: str
    emoji: str
    default_config: dict[str, Any] = field(default_factory=dict)


def _tz_offset(config: dict[str, Any]) -> timedelta:
    return timedelta(minutes=int(config.get("tz_offset_minutes", _DEFAULT_TZ_OFFSET_MIN)))


def local_now(config: dict[str, Any]) -> datetime:
    """Текущее локальное время семьи (naive) для сравнения с config['hour']."""
    return (datetime.now(timezone.utc) + _tz_offset(config)).replace(tzinfo=None)


def local_today(config: dict[str, Any]) -> date:
    return local_now(config).date()


def to_local(dt: datetime, config: dict[str, Any]) -> datetime:
    """Переводит aware-datetime в локальное время семьи (naive)."""
    return (dt.astimezone(timezone.utc) + _tz_offset(config)).replace(tzinfo=None)


# ── Хендлеры ─────────────────────────────────────────────────────────────

async def _handle_birthday(
    db: AsyncSession, family_id: UUID, config: dict[str, Any]
) -> str | None:
    today = local_today(config)
    rows = await db.scalars(
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(
            Membership.family_id == family_id,
            User.is_bot == False,  # noqa: E712
            User.birthday.is_not(None),
            extract("month", User.birthday) == today.month,
            extract("day", User.birthday) == today.day,
        )
    )
    people = rows.all()
    if not people:
        return None

    parts: list[str] = []
    for u in people:
        age = today.year - u.birthday.year if u.birthday else None
        if age and age > 0:
            parts.append(f"{u.display_name} ({age})")
        else:
            parts.append(u.display_name)

    if len(parts) == 1:
        return f"🎂 Сегодня день рождения у {parts[0]}! Поздравляем! 🎉"
    listed = ", ".join(parts)
    return f"🎂 Сегодня дни рождения у {listed}! Поздравляем! 🎉"


async def _handle_digest(
    db: AsyncSession, family_id: UUID, config: dict[str, Any]
) -> str | None:
    offset = _tz_offset(config)
    today = local_today(config)
    # Окно [начало локального дня, +24ч) в UTC для сравнения с timestamptz.
    day_start_local = datetime(today.year, today.month, today.day)
    start_utc = (day_start_local - offset).replace(tzinfo=timezone.utc)
    end_utc = start_utc + timedelta(days=1)

    rows = await db.scalars(
        select(CalendarEvent)
        .where(
            CalendarEvent.family_id == family_id,
            CalendarEvent.starts_at >= start_utc,
            CalendarEvent.starts_at < end_utc,
        )
        .order_by(CalendarEvent.starts_at.asc())
    )
    events = rows.all()
    if not events:
        return None

    lines: list[str] = []
    for e in events:
        local_start = e.starts_at.astimezone(timezone.utc) + offset
        lines.append(f"• {local_start:%H:%M} — {e.title}")
    return "☀️ События на сегодня:\n" + "\n".join(lines)


# ── Реестр ───────────────────────────────────────────────────────────────

PRESETS: dict[str, PresetMeta] = {
    "birthday": PresetMeta(
        key="birthday",
        title="Дни рождения",
        description="Поздравляет членов семьи с днём рождения",
        default_display_name="Поздравлятор",
        emoji="🎂",
        default_config={"hour": 9, "tz_offset_minutes": _DEFAULT_TZ_OFFSET_MIN},
    ),
    "digest": PresetMeta(
        key="digest",
        title="Утренний дайджест",
        description="Каждое утро присылает события календаря на сегодня",
        default_display_name="Дайджест",
        emoji="☀️",
        default_config={"hour": 8, "tz_offset_minutes": _DEFAULT_TZ_OFFSET_MIN},
    ),
}

PRESET_HANDLERS: dict[
    str, Callable[[AsyncSession, UUID, dict[str, Any]], Awaitable[str | None]]
] = {
    "birthday": _handle_birthday,
    "digest": _handle_digest,
}
