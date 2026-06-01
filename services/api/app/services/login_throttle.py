"""Персистентная защита /auth/pin от перебора (CWE-307).

Счётчик неудачных входов и прогрессивный лок-аут живут в таблице
``login_throttle`` (Postgres), поэтому переживают рестарт API и общие между
воркерами — в отличие от in-memory ``SlidingWindowLimiter`` (он остаётся как
дополнительный per-IP «пол»).

Политика:
  * MAX_FAILS подряд неудач → аккаунт блокируется на время по текущему уровню;
  * каждый следующий лок-аут — дольше (15 → 30 → 60 мин, дальше 60);
  * успешный вход обнуляет всё.

Записи фиксируются (commit) внутри функций, чтобы сохраняться даже когда
эндпоинт затем отвечает 401/429.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.login_throttle import LoginThrottle

logger = logging.getLogger("lentik.security")

# Сколько неудач подряд допускается до блокировки.
MAX_FAILS = 5
# Длительность блокировки по уровню (минуты). Последнее значение — потолок.
LOCKOUT_MINUTES = [15, 30, 60]


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def check_locked(db: AsyncSession, username: str) -> int | None:
    """Если аккаунт сейчас заблокирован — сколько секунд осталось, иначе None."""
    row = await db.get(LoginThrottle, username.lower())
    if not row or not row.locked_until:
        return None
    locked_until = row.locked_until
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    remaining = (locked_until - _now()).total_seconds()
    return int(remaining) if remaining > 0 else None


async def record_failure(db: AsyncSession, username: str) -> tuple[bool, int]:
    """Учитывает неудачную попытку. Возвращает (заблокирован_сейчас, retry_after_сек).

    Коммитит изменения — счётчик переживёт последующий ответ 401.
    """
    uname = username.lower()
    row = await db.get(LoginThrottle, uname)
    if row is None:
        row = LoginThrottle(username=uname, fail_count=0, lockout_level=0)
        db.add(row)

    row.fail_count += 1
    locked_now = False
    retry_after = 0
    if row.fail_count >= MAX_FAILS:
        level = min(row.lockout_level, len(LOCKOUT_MINUTES) - 1)
        minutes = LOCKOUT_MINUTES[level]
        row.locked_until = _now() + timedelta(minutes=minutes)
        row.lockout_level += 1
        row.fail_count = 0
        locked_now = True
        retry_after = minutes * 60
        logger.warning(
            "Account temporarily locked after %d failed PIN attempts: username=%s, "
            "minutes=%d, level=%d",
            MAX_FAILS, uname, minutes, row.lockout_level,
        )

    await db.commit()
    return locked_now, retry_after


async def reset(db: AsyncSession, username: str) -> None:
    """Полный сброс серии при успешном входе."""
    row = await db.get(LoginThrottle, username.lower())
    if row:
        await db.delete(row)
        await db.commit()
