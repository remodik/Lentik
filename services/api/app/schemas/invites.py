from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreateInviteRequest(BaseModel):
    family_id: UUID
    expires_in_hours: int = Field(default=72, ge=1, le=720)


class CreateInviteResponse(BaseModel):
    token: str
    expires_at: datetime
    join_url: str