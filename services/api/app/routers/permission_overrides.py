"""CRUD permission overrides на каналы и чаты."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.permissions import Perm, has_perm, permission_labels
from app.db.deps import get_db
from app.models.channel import Channel
from app.models.chat import Chat
from app.models.permission_override import (
    ChannelPermissionOverride,
    ChatPermissionOverride,
)
from app.models.role import FamilyRole
from app.models.user import User
from app.services.audit import log_action
from app.services.family import require_membership
from app.services.roles import effective_permissions

router = APIRouter(prefix="/families/{family_id}", tags=["permissions"])


async def _override_meta(
    db: AsyncSession,
    *,
    role_id: UUID,
    target_name: str | None,
    allow: int = 0,
    deny: int = 0,
) -> dict:
    """Собирает читаемую метадату override-события для журнала."""
    role = await db.get(FamilyRole, role_id)
    return {
        "role_id": str(role_id),
        "role_name": role.name if role else None,
        "target_name": target_name,
        "allowed": permission_labels(allow),
        "denied": permission_labels(deny),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Схемы
# ─────────────────────────────────────────────────────────────────────────────


class OverrideItem(BaseModel):
    role_id: UUID
    allow: int = Field(ge=0)
    deny: int = Field(ge=0)


class OverrideSet(BaseModel):
    overrides: list[OverrideItem]


class OverrideUpsert(BaseModel):
    allow: int = Field(ge=0)
    deny: int = Field(ge=0)


# ─────────────────────────────────────────────────────────────────────────────
# Хелперы доступа
# ─────────────────────────────────────────────────────────────────────────────


async def _require_manage(family_id: UUID, user: User, db: AsyncSession):
    """Управлять overrides можно с MANAGE_CHANNELS либо с MANAGE_ROLES, либо owner."""
    membership = await require_membership(family_id, user, db)
    if membership.role.value == "owner":
        return membership
    bits = await effective_permissions(db, membership.id)
    if has_perm(bits, Perm.MANAGE_CHANNELS) or has_perm(bits, Perm.MANAGE_ROLES):
        return membership
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Недостаточно прав для управления разрешениями",
    )


# ─────────────────────────────────────────────────────────────────────────────
# CHANNELS
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/channels/{channel_id}/permissions",
    response_model=list[OverrideItem],
)
async def list_channel_overrides(
    family_id: UUID,
    channel_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)
    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Канал не найден")
    rows = (
        await db.scalars(
            select(ChannelPermissionOverride).where(
                ChannelPermissionOverride.channel_id == channel_id
            )
        )
    ).all()
    return [
        OverrideItem(role_id=r.role_id, allow=r.allow, deny=r.deny) for r in rows
    ]


@router.put(
    "/channels/{channel_id}/permissions/{role_id}",
    response_model=OverrideItem,
)
async def upsert_channel_override(
    family_id: UUID,
    channel_id: UUID,
    role_id: UUID,
    body: OverrideUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_manage(family_id, user, db)

    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Канал не найден")
    role = await db.get(FamilyRole, role_id)
    if not role or role.family_id != family_id:
        raise HTTPException(status_code=404, detail="Роль не найдена")

    if body.allow & body.deny:
        raise HTTPException(
            status_code=400,
            detail="Один и тот же бит не может быть и в allow, и в deny",
        )

    existing = await db.scalar(
        select(ChannelPermissionOverride).where(
            ChannelPermissionOverride.channel_id == channel_id,
            ChannelPermissionOverride.role_id == role_id,
        )
    )

    # Если allow=0 и deny=0 — удаляем override, чтобы не плодить пустых строк.
    if body.allow == 0 and body.deny == 0:
        if existing:
            await db.delete(existing)
            await log_action(
                db,
                family_id=family_id,
                actor_id=user.id,
                action="override.removed",
                target_type="channel",
                target_id=channel_id,
                metadata=await _override_meta(
                    db, role_id=role_id, target_name=channel.name
                ),
            )
            await db.commit()
        return OverrideItem(role_id=role_id, allow=0, deny=0)

    if existing:
        existing.allow = body.allow
        existing.deny = body.deny
    else:
        existing = ChannelPermissionOverride(
            channel_id=channel_id,
            role_id=role_id,
            allow=body.allow,
            deny=body.deny,
        )
        db.add(existing)

    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="override.changed",
        target_type="channel",
        target_id=channel_id,
        metadata=await _override_meta(
            db, role_id=role_id, target_name=channel.name,
            allow=body.allow, deny=body.deny,
        ),
    )
    await db.commit()
    return OverrideItem(role_id=role_id, allow=existing.allow, deny=existing.deny)


@router.delete(
    "/channels/{channel_id}/permissions/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_channel_override(
    family_id: UUID,
    channel_id: UUID,
    role_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_manage(family_id, user, db)
    channel = await db.get(Channel, channel_id)
    await db.execute(
        sa_delete(ChannelPermissionOverride).where(
            ChannelPermissionOverride.channel_id == channel_id,
            ChannelPermissionOverride.role_id == role_id,
        )
    )
    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="override.removed",
        target_type="channel",
        target_id=channel_id,
        metadata=await _override_meta(
            db, role_id=role_id, target_name=channel.name if channel else None
        ),
    )
    await db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# CHATS
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/chats/{chat_id}/permissions",
    response_model=list[OverrideItem],
)
async def list_chat_overrides(
    family_id: UUID,
    chat_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)
    chat = await db.get(Chat, chat_id)
    if not chat or chat.family_id != family_id:
        raise HTTPException(status_code=404, detail="Чат не найден")
    rows = (
        await db.scalars(
            select(ChatPermissionOverride).where(
                ChatPermissionOverride.chat_id == chat_id
            )
        )
    ).all()
    return [
        OverrideItem(role_id=r.role_id, allow=r.allow, deny=r.deny) for r in rows
    ]


@router.put(
    "/chats/{chat_id}/permissions/{role_id}",
    response_model=OverrideItem,
)
async def upsert_chat_override(
    family_id: UUID,
    chat_id: UUID,
    role_id: UUID,
    body: OverrideUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_manage(family_id, user, db)

    chat = await db.get(Chat, chat_id)
    if not chat or chat.family_id != family_id:
        raise HTTPException(status_code=404, detail="Чат не найден")
    role = await db.get(FamilyRole, role_id)
    if not role or role.family_id != family_id:
        raise HTTPException(status_code=404, detail="Роль не найдена")

    if body.allow & body.deny:
        raise HTTPException(
            status_code=400,
            detail="Один и тот же бит не может быть и в allow, и в deny",
        )

    existing = await db.scalar(
        select(ChatPermissionOverride).where(
            ChatPermissionOverride.chat_id == chat_id,
            ChatPermissionOverride.role_id == role_id,
        )
    )

    if body.allow == 0 and body.deny == 0:
        if existing:
            await db.delete(existing)
            await log_action(
                db,
                family_id=family_id,
                actor_id=user.id,
                action="override.removed",
                target_type="chat",
                target_id=chat_id,
                metadata=await _override_meta(
                    db, role_id=role_id, target_name=chat.name
                ),
            )
            await db.commit()
        return OverrideItem(role_id=role_id, allow=0, deny=0)

    if existing:
        existing.allow = body.allow
        existing.deny = body.deny
    else:
        existing = ChatPermissionOverride(
            chat_id=chat_id,
            role_id=role_id,
            allow=body.allow,
            deny=body.deny,
        )
        db.add(existing)

    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="override.changed",
        target_type="chat",
        target_id=chat_id,
        metadata=await _override_meta(
            db, role_id=role_id, target_name=chat.name,
            allow=body.allow, deny=body.deny,
        ),
    )
    await db.commit()
    return OverrideItem(role_id=role_id, allow=existing.allow, deny=existing.deny)


@router.delete(
    "/chats/{chat_id}/permissions/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_chat_override(
    family_id: UUID,
    chat_id: UUID,
    role_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_manage(family_id, user, db)
    chat = await db.get(Chat, chat_id)
    await db.execute(
        sa_delete(ChatPermissionOverride).where(
            ChatPermissionOverride.chat_id == chat_id,
            ChatPermissionOverride.role_id == role_id,
        )
    )
    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="override.removed",
        target_type="chat",
        target_id=chat_id,
        metadata=await _override_meta(
            db, role_id=role_id, target_name=chat.name if chat else None
        ),
    )
    await db.commit()
