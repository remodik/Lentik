from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_BANNED_WORDS = 200
MAX_BANNED_WORD_LEN = 60
# Жёсткий потолок длины сообщения в системе (см. chats/channels схемы).
HARD_MESSAGE_LIMIT = 4000


class ModerationSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    invite_max_active: int
    slowmode_default_seconds: int
    banned_words: list[str]
    max_message_length: int


class ModerationSettingsUpdate(BaseModel):
    invite_max_active: int = Field(ge=0, le=1000)
    slowmode_default_seconds: int = Field(ge=0, le=21600)
    banned_words: list[str] = Field(default_factory=list)
    max_message_length: int = Field(ge=0, le=HARD_MESSAGE_LIMIT)

    @field_validator("banned_words")
    @classmethod
    def _clean_words(cls, words: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in words:
            if not isinstance(raw, str):
                continue
            word = " ".join(raw.split()).strip()
            if not word:
                continue
            if len(word) > MAX_BANNED_WORD_LEN:
                word = word[:MAX_BANNED_WORD_LEN]
            key = word.casefold()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(word)
            if len(cleaned) >= MAX_BANNED_WORDS:
                break
        return cleaned
