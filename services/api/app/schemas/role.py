from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class RoleResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: UUID
    family_id: UUID
    slug: str | None
    name: str
    color: str
    priority: int
    permissions: int
    is_preset: bool
    is_everyone: bool
    is_system: bool
    created_at: datetime
    member_count: int = 0


class RoleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    priority: int | None = Field(default=None, ge=0, le=10_000)
    permissions: int | None = Field(default=None, ge=0)


class RoleCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = Field(default="#a1a1aa", pattern=r"^#[0-9a-fA-F]{6}$")
    priority: int = Field(default=50, ge=0, le=10_000)
    permissions: int = Field(default=0, ge=0)


class RoleReorderRequest(BaseModel):
    ordered_ids: list[UUID]


class PermissionBitInfo(BaseModel):
    bit: int
    label: str
    description: str


class PermissionGroupInfo(BaseModel):
    name: str
    perms: list[PermissionBitInfo]


class PermissionsCatalogResponse(BaseModel):
    groups: list[PermissionGroupInfo]


class MemberRoleAssignment(BaseModel):
    role_ids: list[UUID]
