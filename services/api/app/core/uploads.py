import logging
import tempfile
import uuid
from functools import lru_cache
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)
API_ROOT = Path(__file__).resolve().parents[2]
FALLBACK_UPLOAD_DIR = API_ROOT / "uploads"
LEGACY_FALLBACK_UPLOAD_DIR = Path(tempfile.gettempdir()) / "lentik_uploads"


def _is_writable(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / f".write-test-{uuid.uuid4().hex}"
        probe.write_bytes(b"ok")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


def _is_usable_upload_root(root: Path) -> bool:
    # We write different entities under upload subdirs, so they must all be
    # writable even if the root itself is writable.
    return (
        _is_writable(root)
        and _is_writable(root / "avatars")
        and _is_writable(root / "chat_files")
    )


def _resolve_configured_upload_root() -> Path:
    configured = Path(settings.upload_dir).expanduser()
    # Make relative paths stable regardless of the process current working dir.
    if not configured.is_absolute():
        configured = API_ROOT / configured
    return configured.resolve()


@lru_cache(maxsize=1)
def get_upload_root() -> Path:
    configured = _resolve_configured_upload_root()
    if _is_usable_upload_root(configured):
        return configured

    if _is_usable_upload_root(FALLBACK_UPLOAD_DIR):
        logger.warning(
            "Upload directory '%s' (or required subdirs) is not writable. "
            "Using fallback '%s'.",
            configured,
            FALLBACK_UPLOAD_DIR,
        )
        return FALLBACK_UPLOAD_DIR

    if _is_usable_upload_root(LEGACY_FALLBACK_UPLOAD_DIR):
        logger.warning(
            "Upload directories '%s' and '%s' are not writable. "
            "Using legacy fallback '%s'.",
            configured,
            FALLBACK_UPLOAD_DIR,
            LEGACY_FALLBACK_UPLOAD_DIR,
        )
        return LEGACY_FALLBACK_UPLOAD_DIR

    raise RuntimeError(
        f"Upload directories '{configured}', '{FALLBACK_UPLOAD_DIR}' and "
        f"'{LEGACY_FALLBACK_UPLOAD_DIR}' are unavailable or not writable."
    )


UPLOADS_URL_PREFIX = "/static/uploads/"


# ─── Allowlist расширений и безопасная отдача ─────────────
# Канонический список разрешённых расширений вложений. Всё, чего тут нет
# (в частности html/htm/svg/xml/xhtml/js/mjs), отклоняется на загрузке.

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".bmp"}
ALLOWED_VIDEO_EXT = {".mp4", ".mov", ".avi", ".webm", ".mkv", ".m4v", ".3gp"}
ALLOWED_AUDIO_EXT = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".opus"}
ALLOWED_DOC_EXT = {
    # Documents
    ".pdf", ".doc", ".docx", ".odt", ".rtf", ".txt", ".md",
    # Spreadsheets
    ".xls", ".xlsx", ".ods", ".csv",
    # Presentations
    ".ppt", ".pptx", ".odp",
    # Archives
    ".zip", ".rar", ".7z", ".tar", ".gz",
    # E-books
    ".epub", ".fb2", ".mobi",
}
ALLOWED_ATTACHMENT_EXT = (
    ALLOWED_IMAGE_EXT | ALLOWED_VIDEO_EXT | ALLOWED_AUDIO_EXT | ALLOWED_DOC_EXT
)

# Content-Type, которые ни при каких условиях не должны попасть на диск/отдачу:
# исполняемые в контексте браузера (XSS).
DANGEROUS_CONTENT_TYPES = {
    "text/html",
    "application/xhtml+xml",
    "image/svg+xml",
    "application/xml",
    "text/xml",
    "application/javascript",
    "text/javascript",
}

# Расширения, которые безопасно отдавать inline (медиа, реально рендерящееся в UI).
_INLINE_EXT = ALLOWED_IMAGE_EXT | ALLOWED_VIDEO_EXT | ALLOWED_AUDIO_EXT

# Конкретные безопасные media-типы для inline-отдачи (не доверяем mimetypes,
# чтобы расширение не подсунуло, например, text/html).
_INLINE_MEDIA_TYPES: dict[str, str] = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".heic": "image/heic", ".heif": "image/heif",
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".avi": "video/x-msvideo",
    ".webm": "video/webm", ".mkv": "video/x-matroska", ".m4v": "video/x-m4v",
    ".3gp": "video/3gpp",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".m4a": "audio/mp4", ".flac": "audio/flac", ".aac": "audio/aac",
    ".opus": "audio/opus",
}


def safe_serve_params_for_name(name: str) -> tuple[str, str]:
    """То же, что :func:`safe_serve_params`, но по имени/ключу (для не-локальных
    бэкендов хранилища, где нет `Path`). ``name`` может быть полным URL/ключом —
    берётся только его последний сегмент и расширение.
    """
    from pathlib import PurePosixPath

    leaf = PurePosixPath(name).name or name
    ext = PurePosixPath(leaf).suffix.lower()
    if ext in _INLINE_EXT:
        media_type = _INLINE_MEDIA_TYPES.get(ext, "application/octet-stream")
        if media_type != "application/octet-stream":
            return media_type, "inline"
    safe_name = leaf.replace('"', "").replace("\\", "")
    return "application/octet-stream", f'attachment; filename="{safe_name}"'


def safe_serve_params(path: Path) -> tuple[str, str]:
    """Возвращает (media_type, content_disposition) для безопасной отдачи файла.

    Медиа (картинки/видео/аудио из allowlist) отдаются inline с конкретным
    безопасным типом. Всё остальное форсится на скачивание как
    ``application/octet-stream`` — чтобы html/svg/неизвестное не исполнялось
    в браузере на origin API.
    """
    return safe_serve_params_for_name(path.name)


def resolve_upload_path(stored_url: str) -> Path | None:
    """Преобразовать сохранённый `url` обратно в путь под UPLOAD_DIR.

    Возвращает None, если url некорректен или resolved-путь выходит за пределы
    UPLOAD_DIR — защита от мусора/манипуляций.
    """
    if not isinstance(stored_url, str) or not stored_url.startswith(UPLOADS_URL_PREFIX):
        return None
    relative = stored_url[len(UPLOADS_URL_PREFIX):]
    if not relative or relative.startswith("/") or ".." in relative.split("/"):
        return None
    root = get_upload_root().resolve()
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate
