from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    username: str
    display_name: str
    avatar_url: str | None
    bio: str | None
    birthday: date | None
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    username: str | None = Field(default=None, min_length=2, max_length=64)
    bio: str | None = Field(default=None, max_length=300)
    birthday: date | None = None


class ChangePinRequest(BaseModel):
    current_pin: str = Field(min_length=4, max_length=4)
    new_pin: str = Field(min_length=4, max_length=4)


class MyFamilyResponse(BaseModel):
    family_id: UUID
    family_name: str
    role: str
    joined_at: datetime