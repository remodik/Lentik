"""Хелперы для работы с ролями: сидинг пресетов, расчёт effective-прав."""

from __future__ import annotations

import uuid
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import PRESET_DEFS, Perm
from app.models.membership import Membership
from app.models.role import FamilyRole, MemberRole


async def seed_family_presets(
    db: AsyncSession,
    family_id: uuid.UUID,
    *,
    owner_membership_id: uuid.UUID | None = None,
) -> dict[str, FamilyRole]:
    """Создаёт 6 пресет-ролей для новой семьи и сразу выдаёт владельцу 'owner', а
    всем существующим обычным участникам — 'child' + 'everyone'."""

    created: dict[str, FamilyRole] = {}
    for preset in PRESET_DEFS:
        role = FamilyRole(
            id=uuid.uuid4(),
            family_id=family_id,
            slug=preset["slug"],
            name=preset["name"],
            color=preset["color"],
            priority=preset["priority"],
            permissions=preset["permissions"],
            is_preset=True,
            is_everyone=preset["slug"] == "everyone",
            is_system=preset["is_system"],
        )
        db.add(role)
        created[preset["slug"]] = role

    await db.flush()

    # Выдаём роли всем уже существующим участникам (на этапе создания обычно
    # только владелец).
    memberships = (
        await db.scalars(select(Membership).where(Membership.family_id == family_id))
    ).all()
    for m in memberships:
        is_owner = (owner_membership_id and m.id == owner_membership_id) or m.role.value == "owner"
        slug = "owner" if is_owner else "child"
        db.add(MemberRole(membership_id=m.id, role_id=created[slug].id))
        db.add(MemberRole(membership_id=m.id, role_id=created["everyone"].id))

    await db.flush()
    return created


async def assign_default_roles_on_join(
    db: AsyncSession,
    membership: Membership,
) -> None:
    """Когда новый участник вступает в семью — даём ему child + everyone."""
    roles = (
        await db.scalars(
            select(FamilyRole).where(
                FamilyRole.family_id == membership.family_id,
                FamilyRole.slug.in_(("child", "everyone")),
            )
        )
    ).all()
    for r in roles:
        db.add(MemberRole(membership_id=membership.id, role_id=r.id))
    await db.flush()


async def effective_permissions(
    db: AsyncSession,
    membership_id: uuid.UUID,
) -> int:
    """Вернёт OR прав всех ролей участника. Без override-ов канала/чата."""
    rows = (
        await db.scalars(
            select(FamilyRole.permissions)
            .join(MemberRole, MemberRole.role_id == FamilyRole.id)
            .where(MemberRole.membership_id == membership_id)
        )
    ).all()
    out = 0
    for bits in rows:
        out |= bits or 0
    return out


async def _apply_overrides(
    db: AsyncSession,
    membership_id: uuid.UUID,
    base: int,
    *,
    channel_id: uuid.UUID | None = None,
    chat_id: uuid.UUID | None = None,
) -> int:
    """Применяет override-ы канала/чата ко всем ролям участника.
    deny применяется первым, потом allow.
    """
    if base & int(Perm.ADMINISTRATOR):
        return base  # шунтируем всё
    if not channel_id and not chat_id:
        return base

    from app.models.permission_override import (
        ChannelPermissionOverride,
        ChatPermissionOverride,
    )

    # Соберём все роли участника
    role_ids = (
        await db.scalars(
            select(MemberRole.role_id).where(MemberRole.membership_id == membership_id)
        )
    ).all()
    if not role_ids:
        return base

    if channel_id:
        overrides = (
            await db.execute(
                select(
                    FamilyRole.priority,
                    ChannelPermissionOverride.allow,
                    ChannelPermissionOverride.deny,
                )
                .join(FamilyRole, FamilyRole.id == ChannelPermissionOverride.role_id)
                .where(
                    ChannelPermissionOverride.channel_id == channel_id,
                    ChannelPermissionOverride.role_id.in_(role_ids),
                )
                .order_by(FamilyRole.priority.desc())
            )
        ).all()
    else:
        overrides = (
            await db.execute(
                select(
                    FamilyRole.priority,
                    ChatPermissionOverride.allow,
                    ChatPermissionOverride.deny,
                )
                .join(FamilyRole, FamilyRole.id == ChatPermissionOverride.role_id)
                .where(
                    ChatPermissionOverride.chat_id == chat_id,
                    ChatPermissionOverride.role_id.in_(role_ids),
                )
                .order_by(FamilyRole.priority.desc())
            )
        ).all()

    for _prio, allow, deny in overrides:
        base &= ~(deny or 0)
        base |= allow or 0
    return base


async def effective_channel_permissions(
    db: AsyncSession,
    membership_id: uuid.UUID,
    channel_id: uuid.UUID,
) -> int:
    base = await effective_permissions(db, membership_id)
    return await _apply_overrides(db, membership_id, base, channel_id=channel_id)


async def effective_chat_permissions(
    db: AsyncSession,
    membership_id: uuid.UUID,
    chat_id: uuid.UUID,
) -> int:
    base = await effective_permissions(db, membership_id)
    return await _apply_overrides(db, membership_id, base, chat_id=chat_id)


# ─── Проверки прав в HTTP-стиле ────────────────────────────────────────────


async def require_family_perm(
    db: AsyncSession,
    membership: Membership,
    perm: Perm,
) -> int:
    """Кидает 403 если у участника нет права в рамках семьи (без override-ов)."""
    from fastapi import HTTPException, status

    # Owner-membership всегда разрешает.
    if membership.role.value == "owner":
        return int(Perm.ADMINISTRATOR)
    bits = await effective_permissions(db, membership.id)
    from app.core.permissions import has_perm as _has

    if not _has(bits, perm):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Недостаточно прав ({perm.name})",
        )
    return bits


async def require_channel_perm(
    db: AsyncSession,
    membership: Membership,
    channel_id: uuid.UUID,
    perm: Perm,
) -> int:
    from fastapi import HTTPException, status
    from app.core.permissions import has_perm as _has

    if membership.role.value == "owner":
        return int(Perm.ADMINISTRATOR)
    bits = await effective_channel_permissions(db, membership.id, channel_id)
    if not _has(bits, perm):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Недостаточно прав ({perm.name}) в канале",
        )
    return bits


async def require_chat_perm(
    db: AsyncSession,
    membership: Membership,
    chat_id: uuid.UUID,
    perm: Perm,
) -> int:
    from fastapi import HTTPException, status
    from app.core.permissions import has_perm as _has

    if membership.role.value == "owner":
        return int(Perm.ADMINISTRATOR)
    bits = await effective_chat_permissions(db, membership.id, chat_id)
    if not _has(bits, perm):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Недостаточно прав ({perm.name}) в чате",
        )
    return bits


def merge_perms(bits: Iterable[int]) -> int:
    out = 0
    for b in bits:
        out |= b or 0
    return out
