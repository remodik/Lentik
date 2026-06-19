"""Единое место для параметров auth-cookie.

Раньше cookie выставлялась в двух местах (auth.py, me.py) с продублированными
параметрами — легко разойтись. Здесь один источник правды.

Политика:
  * httponly=True — JWT недоступен из JS;
  * secure / samesite зависят от is_production:
      - prod: фронт (Vercel) и API (Render) живут на разных доменах, т.е.
        запросы кросс-сайтовые. Браузер шлёт cookie на cross-site fetch только
        при SameSite=None, а None требует Secure. Поэтому в проде —
        ``SameSite=None; Secure``. Обязательно выставлять IS_PRODUCTION=true,
        иначе cookie не уйдёт на API и все запросы вернут 401.
      - локально (HTTP, тот же хост): ``SameSite=Lax`` без Secure — иначе cookie
        не выставится по HTTP и сломается локальная разработка.
    CSRF на write-запросах при SameSite=None прикрыт allow-list'ом CORS-origin
    (allow_credentials с конкретными origin), а CSWSH — явной сверкой Origin в
    ws_security.
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
        # None для кросс-доменного фронта в проде; lax для локального HTTP.
        samesite="none" if settings.is_production else "lax",
        max_age=TOKEN_MAX_AGE,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")
