from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreateInviteRequest(BaseModel):
    family_id: UUID
    expires_in_hours: int = Field(default=72, ge=1, le=720)
    max_uses: int = Field(default=1, ge=1, le=1000)
    revoke_previous: bool = False


class CreateInviteResponse(BaseModel):
    token: str
    expires_at: datetime
    max_uses: int
    uses_count: int
    join_url: str
