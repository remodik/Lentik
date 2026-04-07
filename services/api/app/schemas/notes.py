from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=50000)
    is_personal: bool = True


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, max_length=50000)
    is_personal: bool | None = None


class NoteResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID | None
    author_id: UUID | None
    title: str
    content: str
    is_personal: bool
    created_at: datetime
    updated_at: datetime
