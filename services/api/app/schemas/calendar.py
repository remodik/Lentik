from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

MIN_REMINDER_MINUTES = 1
MAX_REMINDER_MINUTES = 60 * 24 * 30  # 30 days


def _validate_reminder_minutes(value: int | None) -> int | None:
    if value is None:
        return None
    if value < MIN_REMINDER_MINUTES or value > MAX_REMINDER_MINUTES:
        raise ValueError(
            f"reminder_minutes must be between {MIN_REMINDER_MINUTES} and {MAX_REMINDER_MINUTES}"
        )
    return value


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
        return _validate_reminder_minutes(value)


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
        return _validate_reminder_minutes(value)


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
