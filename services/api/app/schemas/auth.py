import re
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    display_name: str = Field(min_length=1, max_length=64)
    pin: str

    @field_validator("pin")
    @classmethod
    def pin_must_be_4_to_8_digits(cls, v: str) -> str:
        if not re.fullmatch(r"\d{4,8}", v):
            raise ValueError("PIN должен быть от 4 до 8 цифр")
        return v


class JoinByInviteRequest(BaseModel):
    token: str
    display_name: str = Field(min_length=1, max_length=64)
    pin: str

    @field_validator("pin")
    @classmethod
    def pin_must_be_4_to_8_digits(cls, v: str) -> str:
        if not re.fullmatch(r"\d{4,8}", v):
            raise ValueError("PIN должен быть от 4 до 8 цифр")
        return v


class JoinByInviteResponse(BaseModel):
    user_id: UUID
    family_id: UUID
    # JWT отдаётся только httpOnly-cookie (CWE-522), в тело не кладётся.
    access_token: str | None = None