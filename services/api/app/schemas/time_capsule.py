"""Схемы капсул времени."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CapsuleCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    unlock_at: datetime


class CapsuleEntryOut(BaseModel):
    id: uuid.UUID
    author_id: uuid.UUID | None
    author_display_name: str | None = None
    text: str
    attachments: list[dict] = []
    created_at: datetime


class CapsuleRow(BaseModel):
    """Карточка капсулы в списке (без чужого контента)."""

    id: uuid.UUID
    title: str
    unlock_at: datetime
    opened: bool          # запечатана/открыта (now >= unlock_at)
    created_by: uuid.UUID | None
    created_at: datetime
    total_entries: int        # всего записей (число — не контент)
    contributors: int         # сколько участников добавили
    your_entries: int         # сколько добавил текущий пользователь


class CapsuleDetail(CapsuleRow):
    """Детально. ``entries`` отдаются по гейту: до открытия — только свои."""

    entries: list[CapsuleEntryOut] = []


class CapsuleEntryCreateResult(BaseModel):
    id: uuid.UUID
