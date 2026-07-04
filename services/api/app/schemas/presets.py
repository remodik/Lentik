from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PresetResponse(BaseModel):
    key: str
    title: str
    description: str
    emoji: str
    enabled: bool
    configured: bool  # есть ли строка в БД (создан ли бот-идентити)
    target_chat_id: UUID | None = None
    bot_user_id: UUID | None = None
    bot_display_name: str | None = None
    hour: int = 9
    tz_offset_minutes: int = 180
    last_run_at: datetime | None = None


class PresetUpdateRequest(BaseModel):
    enabled: bool | None = None
    target_chat_id: UUID | None = None
    hour: int | None = Field(default=None, ge=0, le=23)
    tz_offset_minutes: int | None = Field(default=None, ge=-720, le=840)
