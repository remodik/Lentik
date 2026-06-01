"""CRUD permission overrides на каналы и чаты."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.permissions import (
    PERM_MASK,
    Perm,
    has_perm,
    permission_labels,
    unknown_bits,
)
from app.db.deps import get_db
from app.models.channel import Channel
from app.models.chat import Chat
from app.models.membership import Membership
from app.models.permission_override import (
    ChannelPermissionOverride,
    ChatPermissionOverride,
)
from app.models.role import FamilyRole
from app.models.user import User
from app.services.audit import log_action
from app.services.family import require_membership
from app.services.roles import (
    effective_channel_permissions,
    effective_chat_permissions,
    effective_permissions,
)

router = APIRouter(prefix="/families/{family_id}", tags=["permissions"])

SubjectType = Literal["role", "member"]
ScopeType = Literal["channel", "chat"]


# ─────────────────────────────────────────────────────────────────────────────
# Схемы
# ─────────────────────────────────────────────────────────────────────────────


class OverrideItem(BaseModel):
    subject_type: SubjectType
    role_id: UUID | None = None
    user_id: UUID | None = None
    allow: int = Field(ge=0)
    deny: int = Field(ge=0)


class OverrideUpsert(BaseModel):
    allow: int = Field(ge=0)
    deny: int = Field(ge=0)


# ─────────────────────────────────────────────────────────────────────────────
# Хелперы
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


async def _actor_scope_bits(
    db: AsyncSession,
    membership: Membership,
    scope_type: ScopeType,
    scope_id: UUID,
) -> int:
    """Эффективные права актора в данном скоупе (с учётом override-ов)."""
    if membership.role.value == "owner":
        return int(Perm.ADMINISTRATOR)
    if scope_type == "channel":
        return await effective_channel_permissions(db, membership.id, scope_id)
    return await effective_chat_permissions(db, membership.id, scope_id)


async def _validate_override_request(
    db: AsyncSession,
    membership: Membership,
    scope_type: ScopeType,
    scope_id: UUID,
    body: OverrideUpsert,
) -> None:
    """Защита от эскалации привилегий через override (CWE-269).

    1. Один и тот же бит не может быть и в allow, и в deny.
    2. Бит ADMINISTRATOR нельзя выдавать/снимать через override ни при каких
       условиях — он шунтирует все проверки.
    3. allow/deny должны содержать только известные биты прав.
    4. Не-владелец не может через allow выдать права, которыми сам не обладает
       в этом скоупе.
    """
    if body.allow & body.deny:
        raise HTTPException(
            status_code=400,
            detail="Один и тот же бит не может быть и в allow, и в deny",
        )

    combined = body.allow | body.deny
    if combined & int(Perm.ADMINISTRATOR):
        raise HTTPException(
            status_code=400,
            detail="Бит «Администратор» нельзя назначать через override",
        )
    if unknown_bits(combined):
        raise HTTPException(
            status_code=400,
            detail="В override переданы неизвестные биты прав",
        )

    if membership.role.value == "owner":
        return
    actor_bits = await _actor_scope_bits(db, membership, scope_type, scope_id)
    if actor_bits & int(Perm.ADMINISTRATOR):
        return
    escalated = body.allow & ~actor_bits & PERM_MASK
    if escalated:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Нельзя выдать права, которых нет у вас: "
                + ", ".join(permission_labels(escalated))
            ),
        )


async def _get_scope(
    db: AsyncSession,
    *,
    family_id: UUID,
    scope_type: ScopeType,
    scope_id: UUID,
) -> Channel | Chat:
    if scope_type == "channel":
        scope = await db.get(Channel, scope_id)
        if not scope or scope.family_id != family_id:
            raise HTTPException(status_code=404, detail="Канал не найден")
        return scope

    scope = await db.get(Chat, scope_id)
    if not scope or scope.family_id != family_id:
        raise HTTPException(status_code=404, detail="Чат не найден")
    return scope


async def _get_role(db: AsyncSession, family_id: UUID, role_id: UUID) -> FamilyRole:
    role = await db.get(FamilyRole, role_id)
    if not role or role.family_id != family_id:
        raise HTTPException(status_code=404, detail="Роль не найдена")
    return role


async def _get_member(db: AsyncSession, family_id: UUID, user_id: UUID) -> User:
    membership = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user_id,
        )
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Участник не найден")
    member = await db.get(User, user_id)
    if not member:
        raise HTTPException(status_code=404, detail="Участник не найден")
    return member


def _item(row: ChannelPermissionOverride | ChatPermissionOverride) -> OverrideItem:
    if row.user_id:
        return OverrideItem(
            subject_type="member",
            user_id=row.user_id,
            allow=row.allow,
            deny=row.deny,
        )
    return OverrideItem(
        subject_type="role",
        role_id=row.role_id,
        allow=row.allow,
        deny=row.deny,
    )


async def _override_meta(
    db: AsyncSession,
    *,
    family_id: UUID,
    scope_type: ScopeType,
    scope_id: UUID,
    scope_name: str | None,
    subject_type: SubjectType,
    subject_id: UUID,
    allow: int = 0,
    deny: int = 0,
) -> dict:
    meta = {
        "scope_type": scope_type,
        "scope_id": str(scope_id),
        "subject_type": subject_type,
        "target_type": subject_type,
        "target_name": scope_name,
        "allowed": permission_labels(allow),
        "denied": permission_labels(deny),
    }
    if subject_type == "role":
        role = await db.get(FamilyRole, subject_id)
        meta.update(
            {
                "role_id": str(subject_id),
                "role_name": role.name if role else None,
            }
        )
    else:
        member = await _get_member(db, family_id, subject_id)
        meta.update(
            {
                "member_id": str(subject_id),
                "member_name": member.display_name,
            }
        )
    return meta


def _model_and_field(scope_type: ScopeType):
    if scope_type == "channel":
        return ChannelPermissionOverride, ChannelPermissionOverride.channel_id, "channel_id"
    return ChatPermissionOverride, ChatPermissionOverride.chat_id, "chat_id"


async def _list_overrides(
    *,
    family_id: UUID,
    scope_type: ScopeType,
    scope_id: UUID,
    db: AsyncSession,
    user: User,
) -> list[OverrideItem]:
    await require_membership(family_id, user, db)
    await _get_scope(db, family_id=family_id, scope_type=scope_type, scope_id=scope_id)
    model, scope_field, _scope_kw = _model_and_field(scope_type)
    rows = (
        await db.scalars(select(model).where(scope_field == scope_id))
    ).all()
    return [_item(row) for row in rows]


async def _upsert_override(
    *,
    family_id: UUID,
    scope_type: ScopeType,
    scope_id: UUID,
    subject_type: SubjectType,
    subject_id: UUID,
    body: OverrideUpsert,
    db: AsyncSession,
    user: User,
) -> OverrideItem:
    membership = await _require_manage(family_id, user, db)
    scope = await _get_scope(
        db, family_id=family_id, scope_type=scope_type, scope_id=scope_id
    )
    if subject_type == "role":
        await _get_role(db, family_id, subject_id)
    else:
        await _get_member(db, family_id, subject_id)

    await _validate_override_request(db, membership, scope_type, scope_id, body)

    model, scope_field, scope_kw = _model_and_field(scope_type)
    subject_field = model.role_id if subject_type == "role" else model.user_id
    existing = await db.scalar(
        select(model).where(scope_field == scope_id, subject_field == subject_id)
    )

    if body.allow == 0 and body.deny == 0:
        if existing:
            await db.delete(existing)
            await log_action(
                db,
                family_id=family_id,
                actor_id=user.id,
                action="override.removed",
                target_type="member" if subject_type == "member" else scope_type,
                target_id=subject_id if subject_type == "member" else scope_id,
                metadata=await _override_meta(
                    db,
                    family_id=family_id,
                    scope_type=scope_type,
                    scope_id=scope_id,
                    scope_name=scope.name,
                    subject_type=subject_type,
                    subject_id=subject_id,
                ),
            )
            await db.commit()
        return OverrideItem(
            subject_type=subject_type,
            role_id=subject_id if subject_type == "role" else None,
            user_id=subject_id if subject_type == "member" else None,
            allow=0,
            deny=0,
        )

    if existing:
        existing.allow = body.allow
        existing.deny = body.deny
    else:
        kwargs = {
            scope_kw: scope_id,
            "allow": body.allow,
            "deny": body.deny,
        }
        if subject_type == "role":
            kwargs["role_id"] = subject_id
        else:
            kwargs["user_id"] = subject_id
        existing = model(**kwargs)
        db.add(existing)

    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="override.changed",
        target_type="member" if subject_type == "member" else scope_type,
        target_id=subject_id if subject_type == "member" else scope_id,
        metadata=await _override_meta(
            db,
            family_id=family_id,
            scope_type=scope_type,
            scope_id=scope_id,
            scope_name=scope.name,
            subject_type=subject_type,
            subject_id=subject_id,
            allow=body.allow,
            deny=body.deny,
        ),
    )
    await db.commit()
    return _item(existing)


async def _delete_override(
    *,
    family_id: UUID,
    scope_type: ScopeType,
    scope_id: UUID,
    subject_type: SubjectType,
    subject_id: UUID,
    db: AsyncSession,
    user: User,
) -> None:
    await _require_manage(family_id, user, db)
    scope = await _get_scope(
        db, family_id=family_id, scope_type=scope_type, scope_id=scope_id
    )
    if subject_type == "role":
        await _get_role(db, family_id, subject_id)
    else:
        await _get_member(db, family_id, subject_id)

    model, scope_field, _scope_kw = _model_and_field(scope_type)
    subject_field = model.role_id if subject_type == "role" else model.user_id
    await db.execute(
        sa_delete(model).where(scope_field == scope_id, subject_field == subject_id)
    )
    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="override.removed",
        target_type="member" if subject_type == "member" else scope_type,
        target_id=subject_id if subject_type == "member" else scope_id,
        metadata=await _override_meta(
            db,
            family_id=family_id,
            scope_type=scope_type,
            scope_id=scope_id,
            scope_name=scope.name,
            subject_type=subject_type,
            subject_id=subject_id,
        ),
    )
    await db.commit()


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
    return await _list_overrides(
        family_id=family_id,
        scope_type="channel",
        scope_id=channel_id,
        db=db,
        user=user,
    )


@router.put(
    "/channels/{channel_id}/permissions/roles/{role_id}",
    response_model=OverrideItem,
)
async def upsert_channel_role_override(
    family_id: UUID,
    channel_id: UUID,
    role_id: UUID,
    body: OverrideUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _upsert_override(
        family_id=family_id,
        scope_type="channel",
        scope_id=channel_id,
        subject_type="role",
        subject_id=role_id,
        body=body,
        db=db,
        user=user,
    )


@router.put(
    "/channels/{channel_id}/permissions/members/{user_id}",
    response_model=OverrideItem,
)
async def upsert_channel_member_override(
    family_id: UUID,
    channel_id: UUID,
    user_id: UUID,
    body: OverrideUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _upsert_override(
        family_id=family_id,
        scope_type="channel",
        scope_id=channel_id,
        subject_type="member",
        subject_id=user_id,
        body=body,
        db=db,
        user=user,
    )


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
    return await upsert_channel_role_override(
        family_id=family_id,
        channel_id=channel_id,
        role_id=role_id,
        body=body,
        db=db,
        user=user,
    )


@router.delete(
    "/channels/{channel_id}/permissions/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_channel_role_override(
    family_id: UUID,
    channel_id: UUID,
    role_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _delete_override(
        family_id=family_id,
        scope_type="channel",
        scope_id=channel_id,
        subject_type="role",
        subject_id=role_id,
        db=db,
        user=user,
    )


@router.delete(
    "/channels/{channel_id}/permissions/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_channel_member_override(
    family_id: UUID,
    channel_id: UUID,
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _delete_override(
        family_id=family_id,
        scope_type="channel",
        scope_id=channel_id,
        subject_type="member",
        subject_id=user_id,
        db=db,
        user=user,
    )


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
    await delete_channel_role_override(
        family_id=family_id,
        channel_id=channel_id,
        role_id=role_id,
        db=db,
        user=user,
    )


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
    return await _list_overrides(
        family_id=family_id,
        scope_type="chat",
        scope_id=chat_id,
        db=db,
        user=user,
    )


@router.put(
    "/chats/{chat_id}/permissions/roles/{role_id}",
    response_model=OverrideItem,
)
async def upsert_chat_role_override(
    family_id: UUID,
    chat_id: UUID,
    role_id: UUID,
    body: OverrideUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _upsert_override(
        family_id=family_id,
        scope_type="chat",
        scope_id=chat_id,
        subject_type="role",
        subject_id=role_id,
        body=body,
        db=db,
        user=user,
    )


@router.put(
    "/chats/{chat_id}/permissions/members/{user_id}",
    response_model=OverrideItem,
)
async def upsert_chat_member_override(
    family_id: UUID,
    chat_id: UUID,
    user_id: UUID,
    body: OverrideUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await _upsert_override(
        family_id=family_id,
        scope_type="chat",
        scope_id=chat_id,
        subject_type="member",
        subject_id=user_id,
        body=body,
        db=db,
        user=user,
    )


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
    return await upsert_chat_role_override(
        family_id=family_id,
        chat_id=chat_id,
        role_id=role_id,
        body=body,
        db=db,
        user=user,
    )


@router.delete(
    "/chats/{chat_id}/permissions/roles/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_chat_role_override(
    family_id: UUID,
    chat_id: UUID,
    role_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _delete_override(
        family_id=family_id,
        scope_type="chat",
        scope_id=chat_id,
        subject_type="role",
        subject_id=role_id,
        db=db,
        user=user,
    )


@router.delete(
    "/chats/{chat_id}/permissions/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_chat_member_override(
    family_id: UUID,
    chat_id: UUID,
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _delete_override(
        family_id=family_id,
        scope_type="chat",
        scope_id=chat_id,
        subject_type="member",
        subject_id=user_id,
        db=db,
        user=user,
    )


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
    await delete_chat_role_override(
        family_id=family_id,
        chat_id=chat_id,
        role_id=role_id,
        db=db,
        user=user,
    )
