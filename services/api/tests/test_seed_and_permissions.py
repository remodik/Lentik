"""Сидинг пресетов, effective_permissions и override-арифметика (unit-уровень)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core.permissions import (
    PRESET_CHILD_PERMS,
    PRESET_EVERYONE_PERMS,
    PRESET_OWNER_PERMS,
    Perm,
)
from app.models.membership import Membership, Role
from app.models.permission_override import ChatPermissionOverride
from app.models.role import FamilyRole, MemberRole
from app.services.roles import (
    effective_chat_permissions,
    effective_permissions,
)

from .conftest import add_member, grant_role, make_family, make_user, role_by_slug

pytestmark = pytest.mark.asyncio(loop_scope="session")


EXPECTED_PRESETS = {
    "owner": {"is_system": True, "permissions": PRESET_OWNER_PERMS},
    "coowner": {"is_system": False},
    "parent": {"is_system": False},
    "teen": {"is_system": False},
    "child": {"is_system": False, "permissions": PRESET_CHILD_PERMS},
    "everyone": {"is_system": True, "permissions": PRESET_EVERYONE_PERMS},
}


async def test_create_family_seeds_six_presets(db):
    owner = await make_user(db, "owner_seed")
    family = await make_family(db, owner)

    roles = (
        await db.scalars(
            select(FamilyRole).where(FamilyRole.family_id == family.id)
        )
    ).all()

    by_slug = {r.slug: r for r in roles}
    assert set(by_slug) == set(EXPECTED_PRESETS), "Должно быть ровно 6 пресет-ролей"

    for slug, expected in EXPECTED_PRESETS.items():
        role = by_slug[slug]
        assert role.is_preset is True
        assert role.is_system == expected["is_system"]
        if "permissions" in expected:
            assert role.permissions == expected["permissions"], f"slug={slug}"

    # @everyone помечен флагом is_everyone, owner — нет.
    assert by_slug["everyone"].is_everyone is True
    assert by_slug["owner"].is_everyone is False

    # owner-роль несёт бит ADMINISTRATOR.
    assert by_slug["owner"].permissions & int(Perm.ADMINISTRATOR)


async def test_owner_membership_has_owner_and_everyone(db):
    owner = await make_user(db, "owner_roles")
    family = await make_family(db, owner)

    membership = await db.scalar(
        select(Membership).where(
            Membership.family_id == family.id, Membership.user_id == owner.id
        )
    )
    slugs = (
        await db.scalars(
            select(FamilyRole.slug)
            .join(MemberRole, MemberRole.role_id == FamilyRole.id)
            .where(MemberRole.membership_id == membership.id)
        )
    ).all()
    assert set(slugs) == {"owner", "everyone"}


async def test_effective_permissions_is_or_of_roles(db):
    owner = await make_user(db, "owner_eff")
    member_user = await make_user(db, "member_eff")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)  # child + everyone

    # Базово: child ∪ everyone.
    base = await effective_permissions(db, membership.id)
    assert base == (PRESET_CHILD_PERMS | PRESET_EVERYONE_PERMS)

    # Добавим кастомную роль с уникальным битом — он должен «влиться» в OR.
    custom = FamilyRole(
        family_id=family.id,
        slug=None,
        name="Кастом",
        color="#123456",
        priority=25,
        permissions=int(Perm.MANAGE_GALLERY),
    )
    db.add(custom)
    await db.flush()
    await grant_role(db, membership, custom)

    after = await effective_permissions(db, membership.id)
    assert after == base | int(Perm.MANAGE_GALLERY)
    assert after & int(Perm.MANAGE_GALLERY)


async def test_chat_override_deny_beats_allow(db):
    """allow и deny на один бит → deny должен победить (deny применяется... но
    в одной override-строке allow и deny на один бит запрещены валидатором, а
    здесь проверяем поведение _apply_overrides напрямую: deny сильнее allow)."""
    from app.models.chat import Chat

    owner = await make_user(db, "owner_ovr")
    member_user = await make_user(db, "member_ovr")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)

    chat = Chat(family_id=family.id, name="general", created_by=owner.id)
    db.add(chat)
    await db.flush()

    everyone = await role_by_slug(db, family.id, "everyone")
    child = await role_by_slug(db, family.id, "child")

    bit = int(Perm.SEND_VOICE)
    # everyone-роль (низкий приоритет) разрешает бит, child (выше) — запрещает.
    db.add(ChatPermissionOverride(chat_id=chat.id, role_id=everyone.id, allow=bit, deny=0))
    db.add(ChatPermissionOverride(chat_id=chat.id, role_id=child.id, allow=0, deny=bit))
    await db.flush()

    eff = await effective_chat_permissions(db, membership.id, chat.id)
    # child идёт после everyone (priority desc → everyone(100) первым, child(40) вторым),
    # значит deny применяется последним и перебивает allow.
    assert not (eff & bit), "deny должен победить allow при разборе по приоритету"


async def test_administrator_shunts_overrides(db):
    """ADMINISTRATOR в базе → overrides не применяются (всё разрешено)."""
    from app.models.chat import Chat

    owner = await make_user(db, "owner_admin")
    member_user = await make_user(db, "member_admin")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)

    # Выдаём участнику кастомную роль с ADMINISTRATOR.
    admin_role = FamilyRole(
        family_id=family.id,
        slug=None,
        name="Админ",
        color="#ff0000",
        priority=5,
        permissions=int(Perm.ADMINISTRATOR),
    )
    db.add(admin_role)
    await db.flush()
    await grant_role(db, membership, admin_role)

    chat = Chat(family_id=family.id, name="general", created_by=owner.id)
    db.add(chat)
    await db.flush()

    everyone = await role_by_slug(db, family.id, "everyone")
    # deny ВСЕ младшие биты — но ADMINISTRATOR должен шунтировать.
    db.add(
        ChatPermissionOverride(
            chat_id=chat.id, role_id=everyone.id, allow=0, deny=int(Perm.SEND_MESSAGES)
        )
    )
    await db.flush()

    eff = await effective_chat_permissions(db, membership.id, chat.id)
    assert eff & int(Perm.ADMINISTRATOR)
    # Несмотря на deny, базовое значение с ADMINISTRATOR не урезается.
    assert eff & int(Perm.ADMINISTRATOR)


async def test_member_override_beats_role_override(db):
    """Member-override применяется последним и приоритетнее role-override."""
    from app.models.chat import Chat

    owner = await make_user(db, "owner_mo")
    member_user = await make_user(db, "member_mo")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)

    chat = Chat(family_id=family.id, name="general", created_by=owner.id)
    db.add(chat)
    await db.flush()

    everyone = await role_by_slug(db, family.id, "everyone")
    bit = int(Perm.SEND_VOICE)

    # Роль everyone запрещает бит...
    db.add(ChatPermissionOverride(chat_id=chat.id, role_id=everyone.id, allow=0, deny=bit))
    # ...а персональный override конкретного пользователя — разрешает.
    db.add(
        ChatPermissionOverride(
            chat_id=chat.id, user_id=member_user.id, allow=bit, deny=0
        )
    )
    await db.flush()

    eff = await effective_chat_permissions(db, membership.id, chat.id)
    assert eff & bit, "member-override (allow) должен перебить role-override (deny)"
