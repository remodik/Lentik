"""Абстракция хранилища загрузок.

Бэкенд выбирается `settings.storage_backend`. По умолчанию `local` — поведение
идентично прежнему (запись на диск, отдача через FileResponse). Бэкенд 
позволяет нескольким инстансам делить файлы (общий бакет).

Ключ (`key`) — путь относительно upload-root, например:
  ``chat_files/<chat_id>/<name>``, ``avatars/<name>``, ``<family_id>/<name>``.
Публичный URL остаётся ``/static/uploads/<key>`` и проходит те же проверки
доступа в routers/uploads.py.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import AsyncIterator

from app.core.config import settings
from app.core.uploads import (
    UPLOADS_URL_PREFIX,
    get_upload_root,
    resolve_upload_path,
)

logger = logging.getLogger(__name__)


def url_to_key(stored_url: str) -> str | None:
    """`/static/uploads/<key>` → `<key>` с защитой от traversal."""
    if not isinstance(stored_url, str) or not stored_url.startswith(UPLOADS_URL_PREFIX):
        return None
    rel = stored_url[len(UPLOADS_URL_PREFIX):]
    if not rel or rel.startswith("/") or ".." in rel.split("/"):
        return None
    return rel


class LocalStorage:
    """Запись/чтение с локального диска под upload-root."""

    async def save(self, key: str, data: bytes, content_type: str | None = None) -> None:
        dest = get_upload_root() / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)

    def local_path_for_url(self, stored_url: str) -> Path | None:
        return resolve_upload_path(stored_url)

    async def delete_by_url(self, stored_url: str) -> None:
        p = resolve_upload_path(stored_url)
        if p:
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass

    async def open_stream_for_url(
        self, stored_url: str
    ) -> tuple[AsyncIterator[bytes], int] | None:
        # Локально отдаём через FileResponse (routers/uploads.py), стрим не нужен.
        return None

    async def exists_url(self, stored_url: str) -> bool:
        p = resolve_upload_path(stored_url)
        return bool(p and p.is_file())


class S3Storage:
    """S3-совместимое хранилище (boto3/aioboto3)."""

    def __init__(self) -> None:
        self._session = None

    def _client(self):
        import aioboto3  # ленивый импорт: нужен только при storage_backend=s3
        from botocore.config import Config

        if self._session is None:
            self._session = aioboto3.Session()

        return self._session.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region or "auto",
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": settings.s3_addressing_style},
            ),
        )

    async def save(self, key: str, data: bytes, content_type: str | None = None) -> None:
        kwargs = {"Bucket": settings.s3_bucket, "Key": key, "Body": data}
        if content_type:
            kwargs["ContentType"] = content_type
        async with self._client() as s3:
            await s3.put_object(**kwargs)

    def local_path_for_url(self, stored_url: str) -> Path | None:
        return None  # нет локального пути — отдаётся стримом

    async def delete_by_url(self, stored_url: str) -> None:
        key = url_to_key(stored_url)
        if not key:
            return
        try:
            async with self._client() as s3:
                await s3.delete_object(Bucket=settings.s3_bucket, Key=key)
        except Exception:  # noqa: BLE001
            logger.exception("S3 delete failed for %s", key)

    async def open_stream_for_url(
        self, stored_url: str
    ) -> tuple[AsyncIterator[bytes], int] | None:
        key = url_to_key(stored_url)
        if not key:
            return None
        ctx = self._client()
        s3 = await ctx.__aenter__()
        try:
            obj = await s3.get_object(Bucket=settings.s3_bucket, Key=key)
        except Exception:  # noqa: BLE001
            await ctx.__aexit__(None, None, None)
            return None

        size = int(obj.get("ContentLength", 0) or 0)
        body = obj["Body"]

        async def _iter() -> AsyncIterator[bytes]:
            try:
                async for chunk in body.iter_chunks(64 * 1024):
                    yield chunk
            finally:
                await ctx.__aexit__(None, None, None)

        return _iter(), size

    async def exists_url(self, stored_url: str) -> bool:
        key = url_to_key(stored_url)
        if not key:
            return False
        try:
            async with self._client() as s3:
                await s3.head_object(Bucket=settings.s3_bucket, Key=key)
            return True
        except Exception:  # noqa: BLE001
            return False


def _build_storage():
    if settings.storage_backend == "s3":
        if not settings.s3_bucket:
            raise RuntimeError("STORAGE_BACKEND=s3, но S3_BUCKET не задан.")
        logger.info("Storage backend: s3 (bucket=%s)", settings.s3_bucket)
        return S3Storage()
    return LocalStorage()


storage = _build_storage()
