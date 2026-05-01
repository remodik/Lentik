from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

RepeatRuleLiteral = Literal["none", "daily", "weekly", "monthly"]


class ReminderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    remind_at: datetime
    is_personal: bool = False
    repeat_rule: RepeatRuleLiteral = "none"


class ReminderUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    remind_at: datetime | None = None
    is_personal: bool | None = None
    repeat_rule: RepeatRuleLiteral | None = None
    is_done: bool | None = None


class ReminderResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID | None
    author_id: UUID | None
    author_name: str | None = None
    title: str
    notes: str | None
    remind_at: datetime
    is_personal: bool
    repeat_rule: RepeatRuleLiteral
    is_done: bool
    reminder_sent_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ReminderToggleDoneResponse(BaseModel):
    id: UUID
    is_done: bool
    next_remind_at: datetime | None = None
