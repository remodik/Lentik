"""Единое место для параметров auth-cookie.

Раньше cookie выставлялась в двух местах (auth.py, me.py) с продублированными
параметрами — легко разойтись. Здесь один источник правды.

Политика:
  * httponly=True — JWT недоступен из JS;
  * secure=settings.is_production — в проде только по HTTPS.
    обязательно выставлять IS_PRODUCTION=true, иначе cookie уйдёт без Secure по HTTP;
  * samesite="lax" — защищает от CSRF на навигации и не ломает вход (форма с
    того же сайта) и WS-handshake (cookie уходит на same-site upgrade). "strict"
    осознанно не берём: сломал бы переходы по внешним ссылкам-приглашениям.
"""

from __future__ import annotations

from fastapi import Response

from app.core.config import settings
from app.core.jwt import COOKIE_NAME

TOKEN_MAX_AGE = 30 * 24 * 3600  # 30 дней, совпадает с TTL JWT


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=TOKEN_MAX_AGE,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")
