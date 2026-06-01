"""Длина PIN 4–8 и персистентный лок-аут входа (CWE-307, CWE-521)."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _register(client, username: str, pin: str):
    return await client.post(
        "/auth/register",
        json={"username": username, "display_name": username, "pin": pin},
    )


async def test_register_and_login_with_6_digit_pin(db, client):
    resp = await _register(client, "pin6_user", "123456")
    assert resp.status_code == 201, resp.text

    resp = await client.post("/auth/pin", json={"username": "pin6_user", "pin": "123456"})
    assert resp.status_code == 200, resp.text


async def test_register_with_8_digit_pin(db, client):
    resp = await _register(client, "pin8_user", "12345678")
    assert resp.status_code == 201, resp.text


async def test_legacy_4_digit_pin_still_works(db, client):
    resp = await _register(client, "pin4_user", "1234")
    assert resp.status_code == 201, resp.text
    resp = await client.post("/auth/pin", json={"username": "pin4_user", "pin": "1234"})
    assert resp.status_code == 200, resp.text


async def test_too_short_pin_rejected(db, client):
    resp = await _register(client, "pin3_user", "123")
    assert resp.status_code == 422, resp.text


async def test_too_long_pin_rejected(db, client):
    resp = await _register(client, "pin9_user", "123456789")
    assert resp.status_code == 422, resp.text


async def test_account_locks_after_repeated_failures(db, client):
    await _register(client, "lock_user", "1234")

    # 4 неудачи — ещё 401.
    for _ in range(4):
        r = await client.post("/auth/pin", json={"username": "lock_user", "pin": "0000"})
        assert r.status_code == 401, r.text

    # 5-я неудача срабатывает лок-аут → 429 + Retry-After.
    r = await client.post("/auth/pin", json={"username": "lock_user", "pin": "0000"})
    assert r.status_code == 429, r.text
    assert "retry-after" in r.headers

    # Даже верный PIN теперь отклоняется до конца блокировки.
    r = await client.post("/auth/pin", json={"username": "lock_user", "pin": "1234"})
    assert r.status_code == 429, r.text


async def test_successful_login_resets_failure_counter(db, client):
    await _register(client, "reset_user", "1234")

    # Пара неудач, но меньше порога.
    for _ in range(3):
        await client.post("/auth/pin", json={"username": "reset_user", "pin": "0000"})

    # Успешный вход сбрасывает счётчик.
    r = await client.post("/auth/pin", json={"username": "reset_user", "pin": "1234"})
    assert r.status_code == 200, r.text

    # Снова 4 неудачи не должны мгновенно блокировать (серия началась заново).
    for _ in range(4):
        r = await client.post("/auth/pin", json={"username": "reset_user", "pin": "0000"})
        assert r.status_code == 401, r.text
