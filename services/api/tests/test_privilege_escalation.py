"""Защита от эскалации привилегий через override-ы и роли (CWE-269)."""

from __future__ import annotations

import pytest

from app.core.permissions import Perm
from app.models.chat import Chat
from app.models.membership import Membership
from app.models.role import FamilyRole, MemberRole

from .conftest import add_member, auth, make_family, make_user, token_for

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _make_chat(db, family_id, owner) -> Chat:
    chat = Chat(family_id=family_id, name="general", created_by=owner.id)
    db.add(chat)
    await db.flush()
    return chat


async def _grant_perms(db, family_id, membership: Membership, perms: int) -> FamilyRole:
    """Создаёт кастомную роль с заданными битами и выдаёт её участнику."""
    role = FamilyRole(
        family_id=family_id,
        slug=None,
        name="custom",
        color="#ffffff",
        priority=50,
        permissions=perms,
        is_preset=False,
        is_everyone=False,
        is_system=False,
    )
    db.add(role)
    await db.flush()
    db.add(MemberRole(membership_id=membership.id, role_id=role.id))
    await db.flush()
    return role


# ─── permission overrides ───────────────────────────────────────────────


async def test_override_admin_bit_rejected_400(db, client):
    owner = await make_user(db, "owner_m4a")
    member_user = await make_user(db, "member_m4a")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    chat = await _make_chat(db, family.id, owner)
    await _grant_perms(db, family.id, membership, int(Perm.MANAGE_CHANNELS))

    resp = await client.put(
        f"/families/{family.id}/chats/{chat.id}/permissions/members/{member_user.id}",
        json={"allow": int(Perm.ADMINISTRATOR), "deny": 0},
        headers=auth(token_for(member_user)),
    )
    assert resp.status_code == 400, resp.text


async def test_override_unknown_bit_rejected_400(db, client):
    owner = await make_user(db, "owner_m4b")
    member_user = await make_user(db, "member_m4b")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    chat = await _make_chat(db, family.id, owner)
    await _grant_perms(db, family.id, membership, int(Perm.MANAGE_CHANNELS))

    resp = await client.put(
        f"/families/{family.id}/chats/{chat.id}/permissions/members/{member_user.id}",
        json={"allow": 1 << 30, "deny": 0},  # незанятый бит вне маски
        headers=auth(token_for(member_user)),
    )
    assert resp.status_code == 400, resp.text


async def test_override_escalation_rejected_403(db, client):
    owner = await make_user(db, "owner_m4c")
    member_user = await make_user(db, "member_m4c")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    chat = await _make_chat(db, family.id, owner)
    # MANAGE_CHANNELS есть (пускает к управлению), MANAGE_MESSAGES — нет.
    await _grant_perms(db, family.id, membership, int(Perm.MANAGE_CHANNELS))

    resp = await client.put(
        f"/families/{family.id}/chats/{chat.id}/permissions/members/{member_user.id}",
        json={"allow": int(Perm.MANAGE_MESSAGES), "deny": 0},
        headers=auth(token_for(member_user)),
    )
    assert resp.status_code == 403, resp.text


async def test_override_grant_own_perm_ok(db, client):
    owner = await make_user(db, "owner_m4d")
    member_user = await make_user(db, "member_m4d")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    chat = await _make_chat(db, family.id, owner)
    await _grant_perms(db, family.id, membership, int(Perm.MANAGE_CHANNELS))

    # Выдаёт право, которым сам обладает → ок.
    resp = await client.put(
        f"/families/{family.id}/chats/{chat.id}/permissions/members/{member_user.id}",
        json={"allow": int(Perm.MANAGE_CHANNELS), "deny": 0},
        headers=auth(token_for(member_user)),
    )
    assert resp.status_code == 200, resp.text


async def test_owner_override_any_non_admin_ok(db, client):
    owner = await make_user(db, "owner_m4e")
    member_user = await make_user(db, "member_m4e")
    family = await make_family(db, owner)
    await add_member(db, family.id, member_user)
    chat = await _make_chat(db, family.id, owner)

    resp = await client.put(
        f"/families/{family.id}/chats/{chat.id}/permissions/members/{member_user.id}",
        json={"allow": int(Perm.MANAGE_MESSAGES), "deny": 0},
        headers=auth(token_for(owner)),
    )
    assert resp.status_code == 200, resp.text


# ─── Управление ролями ──────────────────────────────────────────────────


async def test_create_role_above_own_perms_rejected_403(db, client):
    owner = await make_user(db, "owner_m5a")
    member_user = await make_user(db, "member_m5a")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    await _grant_perms(db, family.id, membership, int(Perm.MANAGE_ROLES))

    resp = await client.post(
        f"/families/{family.id}/roles",
        json={"name": "Боссы", "permissions": int(Perm.MANAGE_FAMILY)},
        headers=auth(token_for(member_user)),
    )
    assert resp.status_code == 403, resp.text


async def test_create_role_within_own_perms_ok(db, client):
    owner = await make_user(db, "owner_m5b")
    member_user = await make_user(db, "member_m5b")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    await _grant_perms(db, family.id, membership, int(Perm.MANAGE_ROLES))

    resp = await client.post(
        f"/families/{family.id}/roles",
        json={"name": "Модераторы ролей", "permissions": int(Perm.MANAGE_ROLES)},
        headers=auth(token_for(member_user)),
    )
    assert resp.status_code == 201, resp.text


async def test_owner_creates_powerful_role_ok(db, client):
    owner = await make_user(db, "owner_m5c")
    family = await make_family(db, owner)

    resp = await client.post(
        f"/families/{family.id}/roles",
        json={"name": "Управляющие", "permissions": int(Perm.MANAGE_FAMILY)},
        headers=auth(token_for(owner)),
    )
    assert resp.status_code == 201, resp.text


async def test_update_role_escalation_rejected_403(db, client):
    owner = await make_user(db, "owner_m5d")
    member_user = await make_user(db, "member_m5d")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    await _grant_perms(db, family.id, membership, int(Perm.MANAGE_ROLES))

    # Низкоприоритетная роль, существующая в семье.
    target_role = FamilyRole(
        family_id=family.id,
        slug=None,
        name="Болтуны",
        color="#cccccc",
        priority=60,
        permissions=int(Perm.SEND_MESSAGES),
        is_preset=False,
        is_everyone=False,
        is_system=False,
    )
    db.add(target_role)
    await db.flush()

    resp = await client.patch(
        f"/families/{family.id}/roles/{target_role.id}",
        json={"permissions": int(Perm.SEND_MESSAGES) | int(Perm.MANAGE_FAMILY)},
        headers=auth(token_for(member_user)),
    )
    assert resp.status_code == 403, resp.text


async def test_assign_powerful_role_rejected_403(db, client):
    owner = await make_user(db, "owner_m5e")
    actor_user = await make_user(db, "actor_m5e")
    target_user = await make_user(db, "target_m5e")
    family = await make_family(db, owner)
    actor_membership = await add_member(db, family.id, actor_user)
    await add_member(db, family.id, target_user)
    await _grant_perms(db, family.id, actor_membership, int(Perm.MANAGE_ROLES))

    powerful = FamilyRole(
        family_id=family.id,
        slug=None,
        name="Завхоз",
        color="#cccccc",
        priority=55,
        permissions=int(Perm.MANAGE_FAMILY),
        is_preset=False,
        is_everyone=False,
        is_system=False,
    )
    db.add(powerful)
    await db.flush()

    resp = await client.put(
        f"/families/{family.id}/members/{target_user.id}/roles",
        json={"role_ids": [str(powerful.id)]},
        headers=auth(token_for(actor_user)),
    )
    assert resp.status_code == 403, resp.text
