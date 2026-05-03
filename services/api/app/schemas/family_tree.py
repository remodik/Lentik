from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Gender = Literal["male", "female", "other", "unknown"]
RelationType = Literal["parent", "spouse"]


class TreePersonCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    user_id: UUID | None = None
    avatar_url: str | None = Field(default=None, max_length=1024)
    gender: Gender = "unknown"
    birth_date: date | None = None
    death_date: date | None = None
    bio: str | None = Field(default=None, max_length=4000)


class TreePersonUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    user_id: UUID | None = None
    avatar_url: str | None = Field(default=None, max_length=1024)
    gender: Gender | None = None
    birth_date: date | None = None
    death_date: date | None = None
    bio: str | None = Field(default=None, max_length=4000)
    clear_user_link: bool = False
    clear_birth_date: bool = False
    clear_death_date: bool = False


class TreePersonResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID
    user_id: UUID | None
    display_name: str
    avatar_url: str | None
    gender: Gender
    birth_date: date | None
    death_date: date | None
    bio: str | None
    created_at: datetime


class TreeRelationCreate(BaseModel):
    person_a_id: UUID
    person_b_id: UUID
    relation_type: RelationType


class TreeRelationResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID
    person_a_id: UUID
    person_b_id: UUID
    relation_type: RelationType
    created_at: datetime


class TreeResponse(BaseModel):
    persons: list[TreePersonResponse]
    relations: list[TreeRelationResponse]
