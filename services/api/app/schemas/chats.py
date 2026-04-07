from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

EMOJI_PATTERN = r"^(?:[\U0001F300-\U0001FAFF\u2600-\u27BF](?:\uFE0F)?(?:[\U0001F3FB-\U0001F3FF])?)$"


class ChatCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ChatPinRequest(BaseModel):
    message_id: UUID


class PinnedMessagePreview(BaseModel):
    preview_text: str
    author_display_name: str | None
    created_at: datetime


class ChatResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID
    name: str
    created_by: UUID | None
    pinned_message_id: UUID | None = None
    pinned_message: PinnedMessagePreview | None = None
    created_at: datetime


class MessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    reply_to_id: UUID | None = None


class MessageUpdate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class MessageReactionCreate(BaseModel):
    emoji: str = Field(min_length=1, max_length=16, pattern=EMOJI_PATTERN)


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    user_ids: list[str]


class ReaderInfo(BaseModel):
    user_id: str
    display_name: str
    avatar_url: str | None


class MessageAttachment(BaseModel):
    kind: Literal["image", "video", "file", "voice"]
    url: str
    file_name: str
    file_size: int | None = None
    content_type: str | None = None


class MessageReadRequest(BaseModel):
    message_ids: list[UUID] = Field(default_factory=list)


class MessageSearchResult(BaseModel):
    id: UUID
    author_display_name: str | None
    snippet: str
    created_at: datetime
    has_attachments: bool = False
    is_empty: bool = False


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
    attachments: list[MessageAttachment] = []
    reactions: list[ReactionSummary] = []
    readers: list[ReaderInfo] = []
    created_at: datetime
