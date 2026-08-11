"""Генерация и хеширование bot-токенов.

Формат токена: ``lbot_<base64url(32 байта)>``. В БД храним только sha256(token)
в hex — сам токен показывается владельцу один раз при создании/перевыпуске и
больше нигде не хранится (как и положено секрету).
"""

from __future__ import annotations

import hashlib
import secrets

TOKEN_PREFIX = "lbot_"
_RANDOM_BYTES = 32


def generate_bot_token() -> str:
    """Свежий случайный bot-токен (сырой, показать один раз)."""
    return TOKEN_PREFIX + secrets.token_urlsafe(_RANDOM_BYTES)


def hash_bot_token(token: str) -> str:
    """sha256(token) в hex — то, что лежит в БД."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_display_prefix(token: str) -> str:
    """Первые символы токена для узнавания в UI (не секрет)."""
    return token[:12]
