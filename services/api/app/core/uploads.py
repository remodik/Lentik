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


def resolve_upload_path(stored_url: str) -> Path | None:
    """Преобразовать сохранённый `url` обратно в путь под UPLOAD_DIR.

    Возвращает None, если url некорректен или resolved-путь выходит за пределы
    UPLOAD_DIR — защита от мусора/манипуляций (см. CWE-22).
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
