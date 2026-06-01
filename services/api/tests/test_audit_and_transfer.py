"""Журнал аудита + перенос владельца (миграция owner-роли)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.core.permissions import Perm
from app.models.audit_log import AuditLogEntry
from app.models.membership import Membership, Role
from app.models.role import FamilyRole, MemberRole
from app.services.roles import effective_permissions

from .conftest import add_member, auth, make_family, make_user, token_for

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _audit_for(db, family_id, action: str) -> list[AuditLogEntry]:
    rows = (
        await db.scalars(
            select(AuditLogEntry).where(
                AuditLogEntry.family_id == family_id,
                AuditLogEntry.action == action,
            )
        )
    ).all()
    return list(rows)


async def test_role_created_writes_audit(db, client):
    owner = await make_user(db, "owner_a1")
    family = await make_family(db, owner)

    resp = await client.post(
        f"/families/{family.id}/roles",
        json={"name": "Журналируемая", "permissions": int(Perm.MANAGE_GALLERY)},
        headers=auth(token_for(owner)),
    )
    assert resp.status_code == 201, resp.text

    entries = await _audit_for(db, family.id, "role.created")
    assert len(entries) == 1
    entry = entries[0]
    assert entry.actor_id == owner.id
    assert entry.target_type == "role"
    assert entry.metadata_json["name"] == "Журналируемая"
    assert entry.metadata_json["permissions"] == int(Perm.MANAGE_GALLERY)


async def test_family_rename_writes_audit(db, client):
    owner = await make_user(db, "owner_a2")
    family = await make_family(db, owner)

    resp = await client.patch(
        f"/families/{family.id}",
        json={"name": "Новое имя"},
        headers=auth(token_for(owner)),
    )
    assert resp.status_code == 200, resp.text

    entries = await _audit_for(db, family.id, "family.renamed")
    assert len(entries) == 1
    meta = entries[0].metadata_json
    assert meta["to"] == "Новое имя"
    assert "from" in meta


async def test_transfer_ownership_migrates_owner_role(db, client):
    owner = await make_user(db, "owner_t1")
    heir = await make_user(db, "heir_t1")
    family = await make_family(db, owner)
    heir_membership = await add_member(db, family.id, heir)

    owner_membership = await db.scalar(
        select(Membership).where(
            Membership.family_id == family.id, Membership.user_id == owner.id
        )
    )

    # До передачи: старый владелец — ADMINISTRATOR через owner-роль.
    before = await effective_permissions(db, owner_membership.id)
    assert before & int(Perm.ADMINISTRATOR)

    resp = await client.post(
        f"/families/{family.id}/transfer-ownership",
        json={"user_id": str(heir.id)},
        headers=auth(token_for(owner)),
    )
    assert resp.status_code == 200, resp.text

    # Роли membership меняются: heir становится owner, старый — member.
    await db.refresh(owner_membership)
    await db.refresh(heir_membership)
    assert heir_membership.role == Role.OWNER
    assert owner_membership.role == Role.MEMBER

    # FamilyRole 'owner' мигрировала: у heir есть, у старого — нет.
    def has_owner_role(membership_id):
        return db.scalar(
            select(MemberRole)
            .join(FamilyRole, FamilyRole.id == MemberRole.role_id)
            .where(
                MemberRole.membership_id == membership_id,
                FamilyRole.slug == "owner",
            )
        )

    assert await has_owner_role(heir_membership.id) is not None
    assert await has_owner_role(owner_membership.id) is None

    # Старый владелец теряет ADMINISTRATOR через effective_permissions.
    after = await effective_permissions(db, owner_membership.id)
    assert not (after & int(Perm.ADMINISTRATOR)), "старый owner не должен сохранить ADMINISTRATOR"

    # Запись в журнал создана.
    entries = await _audit_for(db, family.id, "family.ownership_transferred")
    assert len(entries) == 1
    assert entries[0].target_id == heir.id
