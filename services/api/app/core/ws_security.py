"""Проверка Origin для WebSocket-handshake (defense-in-depth против CSWSH, CWE-346).

В проде cookie ставится с SameSite=None (фронт и API на разных доменах), т.е.
уходит и на cross-site WS-upgrade — поэтому явная сверка Origin здесь и есть
основная защита от CSWSH, а не настройки cookie.

Политика: если заголовок Origin присутствует — он обязан быть в
``settings.cors_origins``. Отсутствие Origin (нативные/мобильные клиенты, которые
его не шлют) — допускаем, т.к. у них нет браузерного ambient-cookie и CSWSH к ним
неприменим.
"""

from __future__ import annotations

from starlette.websockets import WebSocket

from app.core.config import settings


def is_allowed_ws_origin(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    if origin is None:
        return True
    return origin in settings.cors_origins
