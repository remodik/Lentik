import re
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class MeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    username: str
    display_name: str
    avatar_url: str | None
    bio: str | None
    birthday: date | None
    is_online: bool
    last_seen_at: datetime | None
    created_at: datetime
    ui_mode: str = "simple"
    is_developer: bool = False


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    username: str | None = Field(default=None, min_length=2, max_length=64)
    bio: str | None = Field(default=None, max_length=300)
    birthday: date | None = None
    ui_mode: str | None = Field(default=None, pattern=r"^(simple|advanced|expert)$")


class ChangePinRequest(BaseModel):
    # current_pin может быть старым 4-значным; new_pin — 4–8 цифр.
    current_pin: str = Field(min_length=4, max_length=8)
    new_pin: str = Field(min_length=4, max_length=8)

    @field_validator("new_pin")
    @classmethod
    def new_pin_must_be_4_to_8_digits(cls, v: str) -> str:
        if not re.fullmatch(r"\d{4,8}", v):
            raise ValueError("PIN должен быть от 4 до 8 цифр")
        return v


class MyFamilyResponse(BaseModel):
    family_id: UUID
    family_name: str
    role: str
    joined_at: datetime


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=512)
    auth: str = Field(min_length=1, max_length=512)


class PushSubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)
    keys: PushKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)


class PushPublicKeyResponse(BaseModel):
    enabled: bool
    public_key: str | None = None
