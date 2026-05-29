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


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    username: str | None = Field(default=None, min_length=2, max_length=64)
    bio: str | None = Field(default=None, max_length=300)
    birthday: date | None = None
    ui_mode: str | None = Field(default=None, pattern=r"^(simple|advanced)$")


class ChangePinRequest(BaseModel):
    current_pin: str = Field(min_length=4, max_length=4)
    new_pin: str = Field(min_length=4, max_length=4)

    @field_validator("new_pin")
    @classmethod
    def new_pin_must_be_4_digits(cls, v: str) -> str:
        if not re.fullmatch(r"\d{4}", v):
            raise ValueError("PIN должен быть 4 цифры")
        return v


class MyFamilyResponse(BaseModel):
    family_id: UUID
    family_name: str
    role: str
    joined_at: datetime
