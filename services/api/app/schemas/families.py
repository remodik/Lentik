from uuid import UUID

from pydantic import BaseModel, Field


class CreateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class FamilyResponse(BaseModel):
    id: UUID
    name: str
