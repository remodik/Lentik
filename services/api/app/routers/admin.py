"""Платформенная админ-панель (/admin). Доступ только для разработчика.

Read-only обзор (пользователи, семьи, статистика, глобальный аудит) + бан/разбан.
Каждое мутирующее действие пишется в platform_audit_log.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_developer
from app.core.uploads import get_upload_root
from app.db.deps import get_db
from app.models.family import Family
from app.models.membership import Membership
from app.models.message import Message
from app.models.platform_audit_log import PlatformAuditLogEntry
from app.models.user import User
from app.schemas.admin import (
    AdminAuditRow,
    AdminFamilyDetail,
    AdminFamilyMember,
    AdminFamilyRow,
    AdminStats,
    AdminUserDetail,
    AdminUserFamily,
    AdminUserRow,
    BanRequest,
)
from app.services.audit import log_platform_action
from app.ws.manager import ws_manager

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_developer)])


@router.get("/users", response_model=list[AdminUserRow])
async def list_users(
    db: AsyncSession = Depends(get_db),
    q: str | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    member_counts = dict(
        (
            await db.execute(
                select(Membership.user_id, func.count(Membership.id)).group_by(
                    Membership.user_id
                )
            )
        ).all()
    )
    stmt = select(User)
    if q and q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            User.username.ilike(pattern) | User.display_name.ilike(pattern)
        )
    users = (
        await db.scalars(
            stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()
    return [
        AdminUserRow(
            id=u.id,
            username=u.username,
            display_name=u.display_name,
            is_developer=u.is_developer,
            is_banned=u.is_banned,
            ban_reason=u.ban_reason,
            ban_expires_at=u.ban_expires_at,
            is_online=u.is_online,
            family_count=member_counts.get(u.id, 0),
            created_at=u.created_at,
        )
        for u in users
    ]


@router.get("/families", response_model=list[AdminFamilyRow])
async def list_families(
    db: AsyncSession = Depends(get_db),
    q: str | None = None,
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    member_counts = dict(
        (
            await db.execute(
                select(Membership.family_id, func.count(Membership.id)).group_by(
                    Membership.family_id
                )
            )
        ).all()
    )
    stmt = select(Family)
    if q and q.strip():
        stmt = stmt.where(Family.name.ilike(f"%{q.strip()}%"))
    families = (
        await db.scalars(
            stmt.order_by(Family.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()
    return [
        AdminFamilyRow(
            id=f.id,
            name=f.name,
            member_count=member_counts.get(f.id, 0),
            created_at=f.created_at,
        )
        for f in families
    ]


@router.get("/stats", response_model=AdminStats)
async def get_stats(db: AsyncSession = Depends(get_db)):
    users = await db.scalar(select(func.count(User.id))) or 0
    families = await db.scalar(select(func.count(Family.id))) or 0
    messages = await db.scalar(select(func.count(Message.id))) or 0
    banned = await db.scalar(
        select(func.count(User.id)).where(User.is_banned == True)
    ) or 0

    uploads_bytes = 0
    root = get_upload_root()
    try:
        for p in root.rglob("*"):
            if p.is_file():
                uploads_bytes += p.stat().st_size
    except Exception:  # noqa: BLE001
        uploads_bytes = -1  # каталог недоступен (например, S3-бэкенд)

    return AdminStats(
        users=users,
        families=families,
        messages=messages,
        banned_users=banned,
        uploads_bytes=uploads_bytes,
    )


@router.get("/audit", response_model=list[AdminAuditRow])
async def list_audit(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    rows = (
        await db.execute(
            select(PlatformAuditLogEntry, User.username, User.display_name)
            .outerjoin(User, User.id == PlatformAuditLogEntry.actor_id)
            .order_by(PlatformAuditLogEntry.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return [
        AdminAuditRow(
            id=r.id,
            actor_id=r.actor_id,
            actor_username=actor_username,
            actor_display_name=actor_display_name,
            action=r.action,
            target_type=r.target_type,
            target_id=r.target_id,
            metadata=r.metadata_json,
            created_at=r.created_at,
        )
        for (r, actor_username, actor_display_name) in rows
    ]


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    rows = (
        await db.execute(
            select(Family.id, Family.name, Membership.role)
            .join(Membership, Membership.family_id == Family.id)
            .where(Membership.user_id == user_id)
            .order_by(Family.created_at.desc())
        )
    ).all()
    families = [
        AdminUserFamily(family_id=fid, family_name=fname, role=role.value)
        for (fid, fname, role) in rows
    ]
    return AdminUserDetail(
        id=user.id,
        username=user.username,
        display_name=user.display_name,
        is_developer=user.is_developer,
        is_banned=user.is_banned,
        ban_reason=user.ban_reason,
        ban_expires_at=user.ban_expires_at,
        is_online=user.is_online,
        family_count=len(families),
        created_at=user.created_at,
        last_seen_at=user.last_seen_at,
        banned_at=user.banned_at,
        families=families,
    )


@router.get("/families/{family_id}", response_model=AdminFamilyDetail)
async def get_family_detail(family_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    family = await db.get(Family, family_id)
    if family is None:
        raise HTTPException(status_code=404, detail="Семья не найдена")

    rows = (
        await db.execute(
            select(
                User.id,
                User.username,
                User.display_name,
                Membership.role,
                User.is_online,
                User.is_banned,
                User.is_developer,
            )
            .join(Membership, Membership.user_id == User.id)
            .where(Membership.family_id == family_id)
            .order_by(Membership.created_at.asc())
        )
    ).all()
    members = [
        AdminFamilyMember(
            user_id=uid,
            username=username,
            display_name=display_name,
            role=role.value,
            is_online=is_online,
            is_banned=is_banned,
            is_developer=is_developer,
        )
        for (uid, username, display_name, role, is_online, is_banned, is_developer) in rows
    ]
    return AdminFamilyDetail(
        id=family.id,
        name=family.name,
        member_count=len(members),
        created_at=family.created_at,
        members=members,
    )


@router.post("/users/{user_id}/ban", status_code=status.HTTP_204_NO_CONTENT)
async def ban_user(
    user_id: uuid.UUID,
    body: BanRequest,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_developer),
):
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="Нельзя забанить самого себя")
    if target.is_developer:
        raise HTTPException(status_code=400, detail="Нельзя забанить разработчика")

    now = datetime.now(timezone.utc)
    expires_at = body.expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at is not None and expires_at <= now:
        raise HTTPException(status_code=400, detail="Срок бана должен быть в будущем")

    target.is_banned = True
    target.ban_reason = body.reason
    target.ban_expires_at = expires_at
    target.banned_at = now
    target.banned_by = actor.id
    # Force-logout: сдвигаем password_changed_at — все ранее выпущенные JWT
    # перестают приниматься (механизм отзыва в auth/deps.py).
    target.password_changed_at = now

    await log_platform_action(
        db,
        actor_id=actor.id,
        action="user.banned",
        target_type="user",
        target_id=target.id,
        metadata={
            "reason": body.reason,
            "expires_at": expires_at.isoformat() if expires_at else None,
        },
    )
    await db.commit()

    # Best-effort: закрыть активные WS и сказать клиенту уйти на /login.
    try:
        await ws_manager.force_logout_user(target.id)
    except Exception:  # noqa: BLE001
        pass


@router.post("/users/{user_id}/unban", status_code=status.HTTP_204_NO_CONTENT)
async def unban_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_developer),
):
    target = await db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    target.is_banned = False
    target.ban_reason = None
    target.ban_expires_at = None

    await log_platform_action(
        db,
        actor_id=actor.id,
        action="user.unbanned",
        target_type="user",
        target_id=target.id,
    )
    await db.commit()
