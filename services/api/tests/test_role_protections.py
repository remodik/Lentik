"""Защиты ролей: системные роли, ADMINISTRATOR, owner-роль, @everyone."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.role import FamilyRole, MemberRole
from app.models.membership import Membership

from .conftest import (
    add_member,
    auth,
    grant_role,
    make_family,
    make_user,
    role_by_slug,
    token_for,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _give_manage_roles(db, family_id, membership: Membership) -> None:
    """Выдаёт участнику кастомную роль с MANAGE_ROLES (но без ADMINISTRATOR)."""
    role = FamilyRole(
        family_id=family_id,
        slug=None,
        name="Модератор ролей",
        color="#00aa00",
        priority=15,
        permissions=int(Perm.MANAGE_ROLES),
    )
    db.add(role)
    await db.flush()
    await grant_role(db, membership, role)


async def test_non_owner_cannot_create_admin_role(db, client):
    owner = await make_user(db, "owner_p1")
    mod_user = await make_user(db, "mod_p1")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, mod_user)
    await _give_manage_roles(db, family.id, membership)

    # Пытаемся создать роль с ADMINISTRATOR — не-owner не имеет права.
    resp = await client.post(
        f"/families/{family.id}/roles",
        json={"name": "Суперроль", "permissions": int(Perm.ADMINISTRATOR)},
        headers=auth(token_for(mod_user)),
    )
    assert resp.status_code == 403, resp.text


async def test_non_owner_cannot_assign_owner_role(db, client):
    owner = await make_user(db, "owner_p2")
    mod_user = await make_user(db, "mod_p2")
    victim = await make_user(db, "victim_p2")
    family = await make_family(db, owner)
    mod_membership = await add_member(db, family.id, mod_user)
    await add_member(db, family.id, victim)
    await _give_manage_roles(db, family.id, mod_membership)

    owner_role = await role_by_slug(db, family.id, "owner")

    resp = await client.put(
        f"/families/{family.id}/members/{victim.id}/roles",
        json={"role_ids": [str(owner_role.id)]},
        headers=auth(token_for(mod_user)),
    )
    assert resp.status_code == 403, resp.text


async def test_system_role_cannot_be_deleted(db, client):
    owner = await make_user(db, "owner_p3")
    family = await make_family(db, owner)
    everyone = await role_by_slug(db, family.id, "everyone")
    owner_role = await role_by_slug(db, family.id, "owner")

    for role in (everyone, owner_role):
        resp = await client.delete(
            f"/families/{family.id}/roles/{role.id}",
            headers=auth(token_for(owner)),
        )
        assert resp.status_code == 400, resp.text


async def test_system_role_cannot_be_renamed(db, client):
    owner = await make_user(db, "owner_p4")
    family = await make_family(db, owner)
    everyone = await role_by_slug(db, family.id, "everyone")

    resp = await client.patch(
        f"/families/{family.id}/roles/{everyone.id}",
        json={"name": "ВсеПереименованы"},
        headers=auth(token_for(owner)),
    )
    assert resp.status_code == 400, resp.text


async def test_everyone_stays_after_role_reassignment(db, client):
    """PUT набора ролей не должен снимать @everyone с участника."""
    owner = await make_user(db, "owner_p5")
    member_user = await make_user(db, "member_p5")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)

    # Создаём обычную роль и назначаем её ВМЕСТО всего (owner делает это).
    create = await client.post(
        f"/families/{family.id}/roles",
        json={"name": "Тестовая", "permissions": 0},
        headers=auth(token_for(owner)),
    )
    assert create.status_code == 201, create.text
    role_id = create.json()["id"]

    resp = await client.put(
        f"/families/{family.id}/members/{member_user.id}/roles",
        json={"role_ids": [role_id]},
        headers=auth(token_for(owner)),
    )
    assert resp.status_code == 200, resp.text

    # @everyone должна остаться на участнике.
    slugs = (
        await db.scalars(
            select(FamilyRole.slug)
            .join(MemberRole, MemberRole.role_id == FamilyRole.id)
            .where(MemberRole.membership_id == membership.id)
        )
    ).all()
    assert "everyone" in slugs, "@everyone нельзя снять с участника"
