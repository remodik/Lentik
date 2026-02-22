import re
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class JoinByInviteRequest(BaseModel):
    token: str
    display_name: str = Field(min_length=1, max_length=100)
    pin: str
    phone: str | None = None

    @field_validator("pin")
    @classmethod
    def pin_must_be_4_digits(cls, v: str) -> str:
        if not re.fullmatch(r"\d{4}", v):
            raise ValueError("PIN must be exactly 4 digits")
        return v


class JoinByInviteResponse(BaseModel):
    user_id: UUID
    family_id: UUID
