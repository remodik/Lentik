from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.membership import Role


class CreateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class FamilyResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    name: str
    created_at: datetime


class FamilyMemberResponse(BaseModel):
    user_id: UUID
    username: str
    display_name: str
    avatar_url: str | None
    bio: str | None = None
    birthday: date | None = None
    role: Role
    joined_at: datetime


class FamilyDetailResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    name: str
    created_at: datetime
    members: list[FamilyMemberResponse]