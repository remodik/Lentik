"""JWT не отдаётся в теле ответа, только в httpOnly-cookie.

Раньше /auth/* возвращали access_token в теле, фронт клал его в localStorage →
любой XSS крал долгоживущий bearer. Теперь токен живёт лишь в httpOnly-cookie.
"""

from __future__ import annotations

import pytest

from app.core.jwt import COOKIE_NAME

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_register_sets_cookie_without_token_in_body(db, client):
    resp = await client.post(
        "/auth/register",
        json={"username": "no_leak_user", "display_name": "Без утечки", "pin": "1234"},
    )
    assert resp.status_code == 201, resp.text

    body = resp.json()
    # access_token либо отсутствует, либо пустой — но не реальный JWT.
    assert not body.get("access_token")

    # Токен пришёл httpOnly-cookie.
    assert COOKIE_NAME in resp.cookies
    set_cookie = resp.headers.get("set-cookie", "")
    assert "httponly" in set_cookie.lower()


async def test_login_returns_no_token_in_body(db, client):
    await client.post(
        "/auth/register",
        json={"username": "login_user", "display_name": "Логин", "pin": "1234"},
    )
    resp = await client.post(
        "/auth/pin",
        json={"username": "login_user", "pin": "1234"},
    )
    assert resp.status_code == 200, resp.text
    assert not resp.json().get("access_token")
    assert COOKIE_NAME in resp.cookies
