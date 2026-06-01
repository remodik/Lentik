"""URL-валидация, CORS, WS-origin, rate-limit, права древа."""

from __future__ import annotations

import pytest

from app.core.config import Settings
from app.core.permissions import Perm
from app.core.url_safety import is_safe_user_url, validate_user_url
from app.models.family_tree import FamilyTreePerson
from app.models.role import FamilyRole, MemberRole

from .conftest import add_member, auth, make_family, make_user, role_by_slug, token_for

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ─── Безопасность URL (юнит) ───────────────────────────────────────────


async def test_safe_url_accepts_internal_uploads():
    assert is_safe_user_url("/static/uploads/avatars/a.png")
    assert is_safe_user_url("https://api.lentik.app/static/uploads/x/y.jpg")


async def test_safe_url_rejects_dangerous_and_external():
    for bad in (
        "javascript:alert(1)",
        "data:text/html,<script>1</script>",
        "vbscript:msgbox(1)",
        "file:///etc/passwd",
        "//evil.com/x.png",
        "https://evil.com/track.gif",
        "/etc/passwd",
        "/static/uploads/../../secret",
    ):
        assert not is_safe_user_url(bad), bad


async def test_validate_user_url_raises_on_bad():
    with pytest.raises(ValueError):
        validate_user_url("javascript:alert(1)")
    assert validate_user_url(None) is None
    assert validate_user_url("/static/uploads/a.png") == "/static/uploads/a.png"


# ─── CORS-валидатор ────────────────────────────────────────────────────


async def test_cors_validator_rejects_wildcard():
    with pytest.raises(ValueError):
        Settings.validate_cors_origins(["*"])
    with pytest.raises(ValueError):
        Settings.validate_cors_origins(["https://ok.app", ""])
    assert Settings.validate_cors_origins(["https://ok.app"]) == ["https://ok.app"]


# ─── WS-origin (юнит через фейковый websocket) ──────────────────────────


async def test_ws_origin_helper(monkeypatch):
    from app.core import ws_security

    monkeypatch.setattr(
        ws_security.settings, "cors_origins", ["https://app.lentik.app"], raising=False
    )

    class _WS:
        def __init__(self, origin):
            self.headers = {} if origin is None else {"origin": origin}

    assert ws_security.is_allowed_ws_origin(_WS("https://app.lentik.app"))
    assert not ws_security.is_allowed_ws_origin(_WS("https://evil.com"))
    # Без Origin (нативный клиент) — допускаем.
    assert ws_security.is_allowed_ws_origin(_WS(None))


# ─── rate-limit на регистрацию ──────────────────────────────────────────


async def test_register_rate_limited(db, client):
    # register_ip_limiter = 10/час; 11-я регистрация с одного IP → 429.
    last_status = None
    for i in range(11):
        r = await client.post(
            "/auth/register",
            json={"username": f"rl_user_{i}", "display_name": f"u{i}", "pin": "1234"},
        )
        last_status = r.status_code
    assert last_status == 429


# ─── Права на семейное древо + валидация avatar_url ─────────────────────


async def _grant(db, family_id, membership, perms: int) -> None:
    role = FamilyRole(
        family_id=family_id, slug=None, name="tree-mgr", color="#fff",
        priority=50, permissions=perms, is_preset=False,
        is_everyone=False, is_system=False,
    )
    db.add(role)
    await db.flush()
    db.add(MemberRole(membership_id=membership.id, role_id=role.id))
    await db.flush()


async def test_create_person_requires_manage_tree(db, client):
    owner = await make_user(db, "owner_l13a")
    member_user = await make_user(db, "member_l13a")
    family = await make_family(db, owner)
    await add_member(db, family.id, member_user)

    # Участник без MANAGE_TREE — 403.
    r = await client.post(
        f"/families/{family.id}/tree/persons",
        json={"display_name": "Дед"},
        headers=auth(token_for(member_user)),
    )
    assert r.status_code == 403, r.text

    # Владелец — 201.
    r = await client.post(
        f"/families/{family.id}/tree/persons",
        json={"display_name": "Дед"},
        headers=auth(token_for(owner)),
    )
    assert r.status_code == 201, r.text


async def test_create_person_with_manage_tree_ok(db, client):
    owner = await make_user(db, "owner_l13b")
    member_user = await make_user(db, "member_l13b")
    family = await make_family(db, owner)
    membership = await add_member(db, family.id, member_user)
    await _grant(db, family.id, membership, int(Perm.MANAGE_TREE))

    r = await client.post(
        f"/families/{family.id}/tree/persons",
        json={"display_name": "Бабушка", "avatar_url": "/static/uploads/avatars/x.png"},
        headers=auth(token_for(member_user)),
    )
    assert r.status_code == 201, r.text


async def test_create_person_rejects_bad_avatar_url(db, client):
    owner = await make_user(db, "owner_l13c")
    family = await make_family(db, owner)

    r = await client.post(
        f"/families/{family.id}/tree/persons",
        json={"display_name": "Зло", "avatar_url": "javascript:alert(1)"},
        headers=auth(token_for(owner)),
    )
    assert r.status_code == 422, r.text


# ─── media_urls постов ─────────────────────────────────────────────────


async def test_post_rejects_bad_media_url(db, client):
    owner = await make_user(db, "owner_l14")
    family = await make_family(db, owner)

    # Создаём канал владельцем.
    ch = await client.post(
        f"/families/{family.id}/channels",
        json={"name": "Новости"},
        headers=auth(token_for(owner)),
    )
    assert ch.status_code == 201, ch.text
    channel_id = ch.json()["id"]

    r = await client.post(
        f"/families/{family.id}/channels/{channel_id}/posts",
        json={"text": "пост", "media_urls": ["https://evil.com/track.gif"]},
        headers=auth(token_for(owner)),
    )
    assert r.status_code == 422, r.text
