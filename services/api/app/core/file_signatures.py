"""Проверка содержимого загрузок по сигнатуре (magic-bytes) — defense-in-depth
поверх allowlist расширений и заявленного Content-Type (CWE-434/646).

Зачем, если отдача и так безопасна (медиа — конкретный media-type, остальное —
``application/octet-stream`` + ``nosniff``)? Чтобы файл, чьи байты противоречат
расширению (например, ``.png`` с содержимым HTML/скрипта), вообще не попадал на
диск и не отдавался inline под видом картинки. Особенно важно для медиа, которое
мы отдаём inline.

Политика:
  * для расширений с надёжной сигнатурой — байты ОБЯЗАНЫ ей соответствовать;
  * для текстовых/бессигнатурных форматов (txt, md, csv, rtf-как-текст, fb2, mobi)
    строгой проверки нет — они отдаются как вложение (octet-stream), исполнение в
    браузере исключено.
"""

from __future__ import annotations

from fastapi import HTTPException, status

# Сигнатуры с фиксированным префиксом (offset 0).
_PREFIX_SIGS: dict[str, list[bytes]] = {
    # ── Изображения ─────────────────────────────────────────────────────────
    ".jpg": [b"\xFF\xD8\xFF"],
    ".jpeg": [b"\xFF\xD8\xFF"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".gif": [b"GIF87a", b"GIF89a"],
    ".bmp": [b"BM"],
    # ── Видео/аудио с EBML/Ogg/FLAC/MP3/AAC ─────────────────────────────────
    ".webm": [b"\x1aE\xdf\xa3"],
    ".mkv": [b"\x1aE\xdf\xa3"],
    ".ogg": [b"OggS"],
    ".opus": [b"OggS"],
    ".flac": [b"fLaC"],
    ".mp3": [b"ID3", b"\xFF\xFB", b"\xFF\xF3", b"\xFF\xF2", b"\xFF\xFA"],
    ".aac": [b"\xFF\xF1", b"\xFF\xF9"],
    # ── Документы / архивы ──────────────────────────────────────────────────
    ".pdf": [b"%PDF-"],
    # OOXML/ODF/epub — это zip-контейнеры.
    ".zip": [b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"],
    ".docx": [b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"],
    ".xlsx": [b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"],
    ".pptx": [b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"],
    ".odt": [b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"],
    ".ods": [b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"],
    ".odp": [b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"],
    ".epub": [b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"],
    ".rar": [b"Rar!\x1a\x07"],
    ".7z": [b"7z\xbc\xaf\x27\x1c"],
    ".gz": [b"\x1f\x8b"],
    # Старые OLE-форматы MS Office.
    ".doc": [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"],
    ".xls": [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"],
    ".ppt": [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"],
    ".rtf": [b"{\\rtf"],
}

# Контейнеры RIFF: «RIFF» + 4 байта размера + тег формата на offset 8.
_RIFF_TAGS: dict[str, bytes] = {
    ".webp": b"WEBP",
    ".wav": b"WAVE",
    ".avi": b"AVI ",
}

# ISO BMFF (MP4-семейство): на offset 4 идёт «ftyp».
_FTYP_EXTS = {".mp4", ".m4v", ".mov", ".3gp", ".m4a", ".heic", ".heif"}


def _matches(ext: str, payload: bytes) -> bool | None:
    """True/False — соответствует ли содержимое сигнатуре расширения.
    None — для расширения нет известной сигнатуры (проверку пропускаем).
    """
    if ext in _RIFF_TAGS:
        return payload[:4] == b"RIFF" and payload[8:12] == _RIFF_TAGS[ext]
    if ext in _FTYP_EXTS:
        return payload[4:8] == b"ftyp"
    if ext == ".tar":
        # «ustar» в заголовке tar на offset 257.
        return payload[257:262] == b"ustar"
    prefixes = _PREFIX_SIGS.get(ext)
    if prefixes is None:
        return None
    return any(payload.startswith(p) for p in prefixes)


def signature_reason(ext: str, payload: bytes) -> str | None:
    """Возвращает причину отказа или None, если содержимое допустимо."""
    result = _matches((ext or "").lower(), payload)
    if result is None or result:
        return None
    return f"Содержимое файла не соответствует типу «{ext}»."


def enforce_safe_signature(ext: str, payload: bytes) -> None:
    """Кидает 415, если байты не соответствуют заявленному расширению."""
    reason = signature_reason(ext, payload)
    if reason is not None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=reason,
        )
