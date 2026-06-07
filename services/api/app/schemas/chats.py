from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

# Reaction-emoji validation.
#
# Goal: accept (essentially) *any* real emoji \u2014 including ZWJ sequences
# (\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66, \uD83E\uDDD1\u200D\uD83D\uDCBB, \u2764\uFE0F\u200D\uD83D\uDD25), country flags (\uD83C\uDDF7\uD83C\uDDFA), keycaps (1\uFE0F\u20E3) and the symbol
# ranges the old pattern missed (\u2B50 \u23F0 \u25B6\uFE0F \u00A9\uFE0F \u2026) \u2014 while still rejecting arbitrary
# free text so reactions can't be abused as a side channel.
#
# Strategy: a reaction is one emoji "grapheme cluster". We allow only
# pictographic/symbol codepoints (never ASCII letters, whitespace or general
# punctuation). ASCII keycap bases (0-9 # *) are accepted *only* when followed
# by the combining-enclosing-keycap mark, so a bare "5" can't pass.
_EMOJI_RANGES = (
    "\U0001F000-\U0001FAFF"   # all modern emoji blocks (+ skin tones, regional indicators)
    "\u2600-\u27BF"           # misc symbols + dingbats (\u2600 \u2764 \u2705 \u2728 \u2026)
    "\u2300-\u23FF"           # misc technical (\u231A \u23F0 \u23F3 \u2328 \u2026)
    "\u2B00-\u2BFF"           # \u2B50 \u2B55 \u2B06 \u2B07 \u2B05 \u2026
    "\u2190-\u21FF"           # arrows (\u2194 \u21A9 \u21AA \u2026)
    "\u2934\u2935"            # \u2934 \u2935
    "\u25A0-\u25FF"           # geometric shapes (\u25B6 \u25C0 \u25FB \u25FC \u2026)
    "\u2122\u2139"            # \u2122 \u2139
    "\u00A9\u00AE"            # \u00A9 \u00AE
    "\u203C\u2049"            # \u203C \u2049
    "\u3030\u303D\u3297\u3299"  # \u3030 \u303D \u3297 \u3299
)
# one base codepoint + optional skin-tone modifier + optional variation selector
_EMOJI_ATOM = "[" + _EMOJI_RANGES + "][\U0001F3FB-\U0001F3FF]?\uFE0F?"
_EMOJI_KEYCAP = "[0-9#*]\uFE0F?\u20E3"
_EMOJI_FLAG = "[\U0001F1E6-\U0001F1FF]{2}"
_EMOJI_ZWJ_SEQ = _EMOJI_ATOM + "(?:\u200D" + _EMOJI_ATOM + ")*"
EMOJI_PATTERN = (
    "^(?:" + _EMOJI_KEYCAP + "|" + _EMOJI_FLAG + "|" + _EMOJI_ZWJ_SEQ + ")$"
)


class ChatCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    slow_mode_seconds: int = Field(default=0, ge=0, le=21600)
    is_18plus: bool = False


class ChatUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    slow_mode_seconds: int | None = Field(default=None, ge=0, le=21600)
    is_18plus: bool | None = None


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
    description: str | None = None
    slow_mode_seconds: int = 0
    is_18plus: bool = False
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
