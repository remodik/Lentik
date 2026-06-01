"""Глобальные security-заголовки на ответах API (CWE-693)."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_global_security_headers_present(db, client):
    resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["referrer-policy"] == "no-referrer"
    assert resp.headers["x-frame-options"] == "DENY"
    assert "permissions-policy" in resp.headers
