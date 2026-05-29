"""GET /families/{id}/audit-log — журнал аудита."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.permissions import Perm, has_perm
from app.db.deps import get_db
from app.models.audit_log import AuditLogEntry
from app.models.user import User
from app.services.family import require_membership
from app.services.roles import effective_permissions

router = APIRouter(prefix="/families/{family_id}", tags=["audit"])


class AuditLogResponse(BaseModel):
    id: UUID
    actor_id: UUID | None
    actor_display_name: str | None
    actor_username: str | None
    action: str
    target_type: str | None
    target_id: UUID | None
    metadata: dict[str, Any] | None
    created_at: datetime


@router.get("/audit-log", response_model=list[AuditLogResponse])
async def list_audit_log(
    family_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    before: datetime | None = Query(default=None),
    action: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Возвращает свежие события первыми. ``before`` — для пагинации (cursor).

    Требует ``VIEW_AUDIT_LOG`` или owner-membership.
    """
    membership = await require_membership(family_id, user, db)
    if membership.role.value != "owner":
        bits = await effective_permissions(db, membership.id)
        if not has_perm(bits, Perm.VIEW_AUDIT_LOG):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав для просмотра журнала",
            )

    q = (
        select(AuditLogEntry)
        .where(AuditLogEntry.family_id == family_id)
        .order_by(AuditLogEntry.created_at.desc())
        .limit(limit)
    )
    if before is not None:
        q = q.where(AuditLogEntry.created_at < before)
    if action is not None:
        q = q.where(AuditLogEntry.action == action)

    rows = (await db.scalars(q)).all()

    # Подтягиваем имена авторов одним запросом.
    actor_ids = {r.actor_id for r in rows if r.actor_id}
    actors: dict[UUID, User] = {}
    if actor_ids:
        users = (
            await db.scalars(select(User).where(User.id.in_(actor_ids)))
        ).all()
        actors = {u.id: u for u in users}

    out: list[AuditLogResponse] = []
    for r in rows:
        actor = actors.get(r.actor_id) if r.actor_id else None
        out.append(
            AuditLogResponse(
                id=r.id,
                actor_id=r.actor_id,
                actor_display_name=actor.display_name if actor else None,
                actor_username=actor.username if actor else None,
                action=r.action,
                target_type=r.target_type,
                target_id=r.target_id,
                metadata=r.metadata_json,
                created_at=r.created_at,
            )
        )
    return out
