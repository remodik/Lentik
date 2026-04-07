from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

ALLOWED_REMINDER_MINUTES = {10, 30, 60, 1440}


class CalendarEventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    starts_at: datetime
    ends_at: datetime | None = None
    color: str = Field(default="blue", pattern=r"^(red|green|blue|yellow|purple|orange)$")
    reminder_minutes: int | None = Field(default=None)

    @field_validator("reminder_minutes")
    @classmethod
    def validate_reminder_minutes(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value not in ALLOWED_REMINDER_MINUTES:
            allowed = ", ".join(str(v) for v in sorted(ALLOWED_REMINDER_MINUTES))
            raise ValueError(f"Reminder must be one of: {allowed}")
        return value


class CalendarEventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    color: str | None = Field(default=None, pattern=r"^(red|green|blue|yellow|purple|orange)$")
    reminder_minutes: int | None = Field(default=None)

    @field_validator("reminder_minutes")
    @classmethod
    def validate_reminder_minutes(cls, value: int | None) -> int | None:
        if value is None:
            return None
        if value not in ALLOWED_REMINDER_MINUTES:
            allowed = ", ".join(str(v) for v in sorted(ALLOWED_REMINDER_MINUTES))
            raise ValueError(f"Reminder must be one of: {allowed}")
        return value


class CalendarEventResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID
    created_by: UUID | None
    creator_name: str | None = None
    title: str
    description: str | None
    starts_at: datetime
    ends_at: datetime | None
    color: str
    reminder_minutes: int | None = None
    created_at: datetime
