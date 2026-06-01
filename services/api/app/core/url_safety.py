"""Валидация пользовательских URL-полей.

Где принимаем строки-URL от клиента (avatar_url персоны древа, media_urls
постов и т.п.), пропускаем только безопасные значения:

  * относительные пути на наши загрузки: ``/static/uploads/...``;
  * абсолютные http(s)-URL, чей путь начинается с ``/static/uploads/``
    (фронт иногда присылает уже абсолютную ссылку на тот же файл).

Отклоняем опасные схемы (``javascript:``, ``data:``, ``vbscript:``, ``file:``),
protocol-relative ``//host/...`` и произвольные внешние/трекинговые ссылки.

Примечание: жёсткая привязка абсолютного URL к конкретному origin API не
делается — в настройках нет канонического origin API (есть только cors_origins
фронта). Поэтому абсолютные ссылки допускаются лишь на путь загрузок. Это
закрывает XSS-схемы и произвольные внешние URL; пиннинг origin — на будущее.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

_UPLOADS_PREFIX = "/static/uploads/"
_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.\-]*:")


def is_safe_user_url(value: str) -> bool:
    if not isinstance(value, str):
        return False
    v = value.strip()
    if not v:
        return False
    # Защита от обхода нормализацией пути.
    if ".." in v:
        return False

    # protocol-relative («//evil.com/...») — трактуем как внешний абсолютный.
    if v.startswith("//"):
        return False

    # Абсолютный URL со схемой.
    if _SCHEME_RE.match(v):
        parts = urlsplit(v)
        if parts.scheme.lower() not in ("http", "https"):
            return False  # javascript:, data:, vbscript:, file: и пр.
        return parts.path.startswith(_UPLOADS_PREFIX)

    # Относительный путь — только наши загрузки.
    return v.startswith(_UPLOADS_PREFIX)


def validate_user_url(value: str | None) -> str | None:
    """pydantic-валидатор для одиночного URL-поля. None/пусто → None."""
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    if not is_safe_user_url(v):
        raise ValueError(
            "Недопустимый URL. Разрешены только ссылки на загрузки "
            "(/static/uploads/...)."
        )
    return v


def validate_user_urls(values: list[str] | None) -> list[str] | None:
    """То же для списка URL (например, media_urls)."""
    if values is None:
        return None
    out: list[str] = []
    for item in values:
        validated = validate_user_url(item)
        if validated is not None:
            out.append(validated)
    return out
