"""Сервис лёгкой модерации: настройки семьи + проверки контента."""

from __future__ import annotations

import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family_moderation_settings import FamilyModerationSettings

# Кэш скомпилированных регулярок по нормализованному стоп-слову.
_PATTERN_CACHE: dict[str, re.Pattern[str]] = {}


async def get_settings(
    db: AsyncSession,
    family_id: uuid.UUID,
) -> FamilyModerationSettings | None:
    """Вернёт настройки модерации семьи или None (без создания строки).

    Используется на «горячих» путях (отправка сообщений), чтобы не писать
    в БД при каждом чтении.
    """
    return await db.get(FamilyModerationSettings, family_id)


async def get_or_create_settings(
    db: AsyncSession,
    family_id: uuid.UUID,
) -> FamilyModerationSettings:
    """Вернёт настройки модерации семьи, лениво создав дефолтную строку."""
    settings = await db.get(FamilyModerationSettings, family_id)
    if settings is None:
        settings = FamilyModerationSettings(family_id=family_id)
        db.add(settings)
        await db.flush()
    return settings


def _word_pattern(word: str) -> re.Pattern[str]:
    pat = _PATTERN_CACHE.get(word)
    if pat is None:
        # \b — граница слова (Unicode-aware для str, работает и с кириллицей).
        pat = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE | re.UNICODE)
        _PATTERN_CACHE[word] = pat
    return pat


def find_banned_word(text: str, banned_words: list[str]) -> str | None:
    """Вернёт первое найденное стоп-слово (регистронезависимо, по словам) или None."""
    if not text or not banned_words:
        return None
    for word in banned_words:
        if not word:
            continue
        if _word_pattern(word).search(text):
            return word
    return None


def enforce_message_content(
    settings: FamilyModerationSettings | None,
    text: str,
) -> None:
    """Проверка текста сообщения/поста против настроек модерации.

    Бросает 422 с понятным detail при нарушении. Пустой text пропускается
    (например, сообщение только с вложением).
    """
    if settings is None or not text:
        return

    max_len = settings.max_message_length or 0
    if max_len > 0 and len(text) > max_len:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Сообщение слишком длинное: максимум {max_len} символов "
                f"(сейчас {len(text)})."
            ),
        )

    banned = find_banned_word(text, settings.banned_words or [])
    if banned is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Сообщение содержит запрещённое слово: «{banned}».",
        )


async def count_active_invites(db: AsyncSession, family_id: uuid.UUID) -> int:
    """Кол-во «активных» приглашений: не истёкших и с остатком использований."""
    from datetime import datetime, timezone

    from app.models.invite import Invite

    now = datetime.now(timezone.utc)
    rows = await db.scalars(
        select(Invite).where(
            Invite.family_id == family_id,
            Invite.expires_at > now,
            Invite.uses_count < Invite.max_uses,
        )
    )
    return len(rows.all())
