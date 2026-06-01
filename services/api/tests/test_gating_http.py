"""HTTP-гейтинг отправки сообщений через права и overrides."""

from __future__ import annotations

import pytest
from sqlalchemy import delete, select

from app.core.permissions import Perm
from app.models.chat import Chat
from app.models.membership import Membership
from app.models.permission_override import ChatPermissionOverride
from app.models.role import FamilyRole, MemberRole

from .conftest import add_member, auth, make_family, make_user, role_by_slug, token_for

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _make_chat(db, family_id, owner) -> Chat:
    chat = Chat(family_id=family_id, name="general", created_by=owner.id)
    db.add(chat)
    await db.flush()
    return chat


async def _strip_send_messages(db, family_id, membership: Membership) -> None:
    """Снимает у участника все роли, выдаёт только @everyone и убирает у
    @everyone бит SEND_MESSAGES — чтобы базово прав на отправку не было."""
    everyone = await role_by_slug(db, family_id, "everyone")
    # Оставляем участнику только @everyone.
    await db.execute(
        delete(MemberRole).where(
            MemberRole.membership_id == membership.id,
            MemberRole.role_id != everyone.id,
        )
    )
    # Убираем бит SEND_MESSAGES из @everyone.
    everyone.permissions = everyone.permissions & ~int(Perm.SEND_MESSAGES)
    await db.flush()


async def test_member_without_send_messages_gets_403(db, client):
    owner = await make_user(db, "owner_g1")
    member_user = await make_user(db, "member_g1")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    chat = await _make_chat(db, family.id, owner)

    await _strip_send_messages(db, family.id, membership)

    resp = await client.post(
        f"/families/{family.id}/chats/{chat.id}/messages",
        json={"text": "привет"},
        headers=auth(token_for(member_user)),
    )
    assert resp.status_code == 403, resp.text


async def test_chat_override_allow_grants_201(db, client):
    owner = await make_user(db, "owner_g2")
    member_user = await make_user(db, "member_g2")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    chat = await _make_chat(db, family.id, owner)

    await _strip_send_messages(db, family.id, membership)

    # Override-allow на конкретный чат для @everyone возвращает право отправки.
    everyone = await role_by_slug(db, family.id, "everyone")
    db.add(
        ChatPermissionOverride(
            chat_id=chat.id,
            role_id=everyone.id,
            allow=int(Perm.SEND_MESSAGES),
            deny=0,
        )
    )
    await db.flush()

    resp = await client.post(
        f"/families/{family.id}/chats/{chat.id}/messages",
        json={"text": "теперь можно"},
        headers=auth(token_for(member_user)),
    )
    assert resp.status_code == 201, resp.text


async def test_member_override_priority_over_role(db, client):
    """role-override запрещает, member-override разрешает → 201."""
    owner = await make_user(db, "owner_g3")
    member_user = await make_user(db, "member_g3")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    chat = await _make_chat(db, family.id, owner)

    everyone = await role_by_slug(db, family.id, "everyone")
    # Роль запрещает отправку в этом чате...
    db.add(
        ChatPermissionOverride(
            chat_id=chat.id, role_id=everyone.id, allow=0, deny=int(Perm.SEND_MESSAGES)
        )
    )
    # ...но персональный override разрешает.
    db.add(
        ChatPermissionOverride(
            chat_id=chat.id,
            user_id=member_user.id,
            allow=int(Perm.SEND_MESSAGES),
            deny=0,
        )
    )
    await db.flush()

    resp = await client.post(
        f"/families/{family.id}/chats/{chat.id}/messages",
        json={"text": "персональный allow"},
        headers=auth(token_for(member_user)),
    )
    assert resp.status_code == 201, resp.text


async def test_owner_can_always_send(db, client):
    owner = await make_user(db, "owner_g4")
    family = await make_family(db, owner)
    chat = await _make_chat(db, family.id, owner)

    resp = await client.post(
        f"/families/{family.id}/chats/{chat.id}/messages",
        json={"text": "владелец пишет"},
        headers=auth(token_for(owner)),
    )
    assert resp.status_code == 201, resp.text
