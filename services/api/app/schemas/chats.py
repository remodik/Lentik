from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ChatCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ChatResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID
    name: str
    created_by: UUID | None
    created_at: datetime


class MessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    reply_to_id: UUID | None = None


class MessageUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class MessageResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    chat_id: UUID
    author_id: UUID | None
    author_username: str | None
    author_display_name: str | None
    text: str
    edited: bool
    reply_to_id: UUID | None
    mentions: list[str] = []
    created_at: datetime