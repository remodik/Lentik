from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CalendarEventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    starts_at: datetime
    ends_at: datetime | None = None
    color: str = Field(default="blue", pattern=r"^(red|green|blue|yellow|purple|orange)$")


class CalendarEventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    color: str | None = Field(default=None, pattern=r"^(red|green|blue|yellow|purple|orange)$")


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
    created_at: datetime