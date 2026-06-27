from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class BotCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=64)
    username: str = Field(min_length=2, max_length=64)
    description: str | None = Field(default=None, max_length=500)


class BotResponse(BaseModel):
    id: UUID
    user_id: UUID
    username: str
    display_name: str
    avatar_url: str | None = None
    description: str | None = None
    owner_id: UUID
    token_prefix: str
    created_at: datetime

    model_config = {"from_attributes": True}


class BotWithToken(BotResponse):
    # Сырой токен — отдаётся РОВНО один раз (создание/перевыпуск), в БД не хранится.
    token: str


class BotSendMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    reply_to_id: UUID | None = None
