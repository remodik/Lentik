"""Персистентный счётчик неудачных входов + прогрессивный лок-аут (CWE-307).

Одна строка на username (в нижнем регистре). В отличие от in-memory лимитера,
переживает рестарт API и общий между воркерами. Используется в /auth/pin.

    fail_count    — неудачные попытки в текущей серии (сбрасывается при успехе
                    или при срабатывании лок-аута);
    lockout_level — сколько раз аккаунт уже блокировался подряд (растёт длительность);
    locked_until  — до какого момента вход заблокирован (NULL = не заблокирован).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LoginThrottle(Base):
    __tablename__ = "login_throttle"

    username: Mapped[str] = mapped_column(String(64), primary_key=True)
    fail_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    lockout_level: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<LoginThrottle {self.username} fails={self.fail_count} until={self.locked_until}>"
