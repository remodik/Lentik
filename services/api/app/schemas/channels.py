import json
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class ChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    slow_mode_seconds: int = Field(default=0, ge=0, le=21600)
    is_18plus: bool = False


class ChannelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    slow_mode_seconds: int | None = Field(default=None, ge=0, le=21600)
    is_18plus: bool | None = None


class ChannelResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID
    name: str
    description: str | None
    slow_mode_seconds: int = 0
    is_18plus: bool = False
    created_by: UUID | None
    created_at: datetime


class PostCreate(BaseModel):
    text: str = Field(min_length=1, max_length=10000)
    media_urls: list[str] | None = None


class PostResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    channel_id: UUID
    author_id: UUID | None
    text: str
    media_urls: list[str] | None
    created_at: datetime

    @model_validator(mode="before")
    @classmethod
    def parse_media_urls(cls, values):
        if hasattr(values, "media_urls"):
            raw = values.media_urls
            if isinstance(raw, str):
                try:
                    values.__dict__["media_urls"] = json.loads(raw)
                except (json.JSONDecodeError, AttributeError):
                    pass
        return values