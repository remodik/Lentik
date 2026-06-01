"""Защита от stored XSS через загрузку файлов.

* Вложения с опасным расширением/типом (.html/.svg) отклоняются 415.
* Отдача файлов через _serve всегда несёт X-Content-Type-Options: nosniff;
  документы форсятся на скачивание (attachment + octet-stream), а картинки
  отдаются inline с корректным image/* типом.
"""

from __future__ import annotations

import pytest

from app.models.chat import Chat

from .conftest import auth, make_family, make_user, token_for

pytestmark = pytest.mark.asyncio(loop_scope="session")

# Минимальный валидный PNG (1x1, прозрачный).
PNG_BYTES = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6360000002000100ffff03000006000557bfabd400"
    "00000049454e44ae426082"
)


async def _make_chat(db, family_id, owner) -> Chat:
    chat = Chat(family_id=family_id, name="general", created_by=owner.id)
    db.add(chat)
    await db.flush()
    return chat


async def test_html_attachment_rejected_415(db, client):
    owner = await make_user(db, "owner_h2a")
    family = await make_family(db, owner)
    chat = await _make_chat(db, family.id, owner)

    resp = await client.post(
        f"/families/{family.id}/chats/{chat.id}/messages/attachments",
        files={"files": ("evil.html", b"<script>alert(1)</script>", "text/html")},
        headers=auth(token_for(owner)),
    )
    assert resp.status_code == 415, resp.text


async def test_svg_attachment_rejected_415(db, client):
    owner = await make_user(db, "owner_h2b")
    family = await make_family(db, owner)
    chat = await _make_chat(db, family.id, owner)

    resp = await client.post(
        f"/families/{family.id}/chats/{chat.id}/messages/attachments",
        files={"files": ("evil.svg", b"<svg onload=alert(1)>", "image/svg+xml")},
        headers=auth(token_for(owner)),
    )
    assert resp.status_code == 415, resp.text


async def test_image_uploads_and_served_inline_with_nosniff(db, client):
    owner = await make_user(db, "owner_h2c")
    family = await make_family(db, owner)
    chat = await _make_chat(db, family.id, owner)
    headers = auth(token_for(owner))

    resp = await client.post(
        f"/families/{family.id}/chats/{chat.id}/messages/attachments",
        files={"files": ("pic.png", PNG_BYTES, "image/png")},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    url = resp.json()["attachments"][0]["url"]

    served = await client.get(url, headers=headers)
    assert served.status_code == 200, served.text
    assert served.headers["x-content-type-options"] == "nosniff"
    assert served.headers["content-type"].startswith("image/png")
    assert "inline" in served.headers["content-disposition"]


async def test_document_served_as_attachment_octet_stream(db, client):
    owner = await make_user(db, "owner_h2d")
    family = await make_family(db, owner)
    chat = await _make_chat(db, family.id, owner)
    headers = auth(token_for(owner))

    resp = await client.post(
        f"/families/{family.id}/chats/{chat.id}/messages/attachments",
        files={"files": ("notes.pdf", b"%PDF-1.4 fake", "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    url = resp.json()["attachments"][0]["url"]

    served = await client.get(url, headers=headers)
    assert served.status_code == 200, served.text
    assert served.headers["x-content-type-options"] == "nosniff"
    assert served.headers["content-type"].startswith("application/octet-stream")
    assert served.headers["content-disposition"].startswith("attachment")
