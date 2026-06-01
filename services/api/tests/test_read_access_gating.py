"""Серверная проверка VIEW_CHANNEL / READ_HISTORY на путях чтения.

Раньше эти права не проверялись на сервере: любой член семьи читал любой
чат/канал и всю историю прямым API-вызовом. Тесты фиксируют, что override-deny
VIEW_CHANNEL прячет чат и даёт 403, а deny READ_HISTORY закрывает историю.
"""

from __future__ import annotations

import pytest

from app.core.permissions import Perm
from app.models.channel import Channel
from app.models.chat import Chat
from app.models.permission_override import (
    ChannelPermissionOverride,
    ChatPermissionOverride,
)

from .conftest import add_member, auth, make_family, make_user, token_for

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _make_chat(db, family_id, owner) -> Chat:
    chat = Chat(family_id=family_id, name="general", created_by=owner.id)
    db.add(chat)
    await db.flush()
    return chat


async def _make_channel(db, family_id, owner) -> Channel:
    channel = Channel(family_id=family_id, name="news", created_by=owner.id)
    db.add(channel)
    await db.flush()
    return channel


async def test_view_channel_denied_hides_chat_and_403(db, client):
    owner = await make_user(db, "owner_h1a")
    member_user = await make_user(db, "member_h1a")
    family = await make_family(db, owner)
    await add_member(db, family.id, member_user)
    chat = await _make_chat(db, family.id, owner)

    # Персональный override снимает VIEW_CHANNEL у участника на этом чате.
    db.add(
        ChatPermissionOverride(
            chat_id=chat.id,
            user_id=member_user.id,
            allow=0,
            deny=int(Perm.VIEW_CHANNEL),
        )
    )
    await db.flush()

    headers = auth(token_for(member_user))

    # Чат не виден в списке.
    resp = await client.get(f"/families/{family.id}/chats", headers=headers)
    assert resp.status_code == 200, resp.text
    assert all(c["id"] != str(chat.id) for c in resp.json())

    # Прямой запрос истории — 403.
    resp = await client.get(
        f"/families/{family.id}/chats/{chat.id}/messages", headers=headers
    )
    assert resp.status_code == 403, resp.text

    # Поиск по чату — тоже 403.
    resp = await client.get(
        f"/families/{family.id}/chats/{chat.id}/messages/search?q=привет",
        headers=headers,
    )
    assert resp.status_code == 403, resp.text


async def test_read_history_denied_blocks_messages_but_chat_visible(db, client):
    owner = await make_user(db, "owner_h1b")
    member_user = await make_user(db, "member_h1b")
    family = await make_family(db, owner)
    await add_member(db, family.id, member_user)
    chat = await _make_chat(db, family.id, owner)

    # Снимаем только READ_HISTORY — VIEW_CHANNEL остаётся.
    db.add(
        ChatPermissionOverride(
            chat_id=chat.id,
            user_id=member_user.id,
            allow=0,
            deny=int(Perm.READ_HISTORY),
        )
    )
    await db.flush()

    headers = auth(token_for(member_user))

    # Чат по-прежнему виден (VIEW_CHANNEL есть).
    resp = await client.get(f"/families/{family.id}/chats", headers=headers)
    assert resp.status_code == 200, resp.text
    assert any(c["id"] == str(chat.id) for c in resp.json())

    # Но историю получить нельзя.
    resp = await client.get(
        f"/families/{family.id}/chats/{chat.id}/messages", headers=headers
    )
    assert resp.status_code == 403, resp.text


async def test_owner_reads_everything_despite_overrides(db, client):
    owner = await make_user(db, "owner_h1c")
    family = await make_family(db, owner)
    chat = await _make_chat(db, family.id, owner)

    # Даже при deny на роли владелец шунтирует проверку.
    db.add(
        ChatPermissionOverride(
            chat_id=chat.id,
            user_id=owner.id,
            allow=0,
            deny=int(Perm.VIEW_CHANNEL) | int(Perm.READ_HISTORY),
        )
    )
    await db.flush()

    headers = auth(token_for(owner))

    resp = await client.get(f"/families/{family.id}/chats", headers=headers)
    assert resp.status_code == 200, resp.text
    assert any(c["id"] == str(chat.id) for c in resp.json())

    resp = await client.get(
        f"/families/{family.id}/chats/{chat.id}/messages", headers=headers
    )
    assert resp.status_code == 200, resp.text


async def test_channel_view_denied_hides_and_403(db, client):
    owner = await make_user(db, "owner_h1d")
    member_user = await make_user(db, "member_h1d")
    family = await make_family(db, owner)
    await add_member(db, family.id, member_user)
    channel = await _make_channel(db, family.id, owner)

    db.add(
        ChannelPermissionOverride(
            channel_id=channel.id,
            user_id=member_user.id,
            allow=0,
            deny=int(Perm.VIEW_CHANNEL),
        )
    )
    await db.flush()

    headers = auth(token_for(member_user))

    resp = await client.get(f"/families/{family.id}/channels", headers=headers)
    assert resp.status_code == 200, resp.text
    assert all(c["id"] != str(channel.id) for c in resp.json())

    resp = await client.get(
        f"/families/{family.id}/channels/{channel.id}/posts", headers=headers
    )
    assert resp.status_code == 403, resp.text
