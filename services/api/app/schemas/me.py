from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class MeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    username: str
    avatar_url: str | None
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    username: str | None = Field(default=None, min_length=1, max_length=64)