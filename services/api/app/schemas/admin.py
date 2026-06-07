"""Pydantic-схемы для платформенной админ-панели (/admin)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AdminUserRow(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    is_developer: bool
    is_banned: bool
    ban_reason: str | None = None
    ban_expires_at: datetime | None = None
    is_online: bool
    family_count: int
    created_at: datetime


class AdminFamilyRow(BaseModel):
    id: uuid.UUID
    name: str
    member_count: int
    created_at: datetime


class AdminStats(BaseModel):
    users: int
    families: int
    messages: int
    banned_users: int
    uploads_bytes: int


class AdminAuditRow(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_username: str | None = None
    actor_display_name: str | None = None
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    metadata: dict | None = None
    created_at: datetime


class AdminUserFamily(BaseModel):
    family_id: uuid.UUID
    family_name: str
    role: str


class AdminUserDetail(AdminUserRow):
    last_seen_at: datetime | None = None
    banned_at: datetime | None = None
    families: list[AdminUserFamily] = []


class AdminFamilyMember(BaseModel):
    user_id: uuid.UUID
    username: str
    display_name: str
    role: str
    is_online: bool
    is_banned: bool
    is_developer: bool


class AdminFamilyDetail(AdminFamilyRow):
    members: list[AdminFamilyMember] = []


class BanRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
    # NULL/опущено → бан навсегда. Иначе — момент автоснятия (UTC).
    expires_at: datetime | None = None
