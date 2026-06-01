from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.storage import storage
from app.core.uploads import safe_serve_params, safe_serve_params_for_name
from app.db.deps import get_db
from app.models.chat import Chat
from app.models.user import User
from app.services.family import require_membership

router = APIRouter(prefix="/static/uploads", tags=["uploads"])

_SAFE_HEADERS = {
    "Cache-Control": "private, max-age=300",
    # Не давать браузеру угадывать тип (svg/html как text/html) — CWE-79.
    "X-Content-Type-Options": "nosniff",
}


async def _serve(stored_url: str):
    # Локальный бэкенд — быстрый путь через FileResponse (как раньше).
    path = storage.local_path_for_url(stored_url)
    if path is not None:
        if not path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        media_type, disposition = safe_serve_params(path)
        return FileResponse(
            path,
            media_type=media_type,
            headers={**_SAFE_HEADERS, "Content-Disposition": disposition},
        )

    # Удалённый бэкенд (S3) — стримим с теми же защитными заголовками.
    result = await storage.open_stream_for_url(stored_url)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    iterator, size = result
    media_type, disposition = safe_serve_params_for_name(stored_url)
    headers = {**_SAFE_HEADERS, "Content-Disposition": disposition}
    if size:
        headers["Content-Length"] = str(size)
    return StreamingResponse(iterator, media_type=media_type, headers=headers)


@router.get("/avatars/{filename}")
async def download_avatar(
    filename: str,
    _user: User = Depends(get_current_user),
):
    return await _serve(f"/static/uploads/avatars/{filename}")


@router.get("/chat_files/{chat_id}/{filename}")
async def download_chat_file(
    chat_id: UUID,
    filename: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chat = await db.get(Chat, chat_id)
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    await require_membership(chat.family_id, user, db)
    return await _serve(f"/static/uploads/chat_files/{chat_id}/{filename}")


@router.get("/{family_id}/{filename}")
async def download_family_file(
    family_id: UUID,
    filename: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)
    return await _serve(f"/static/uploads/{family_id}/{filename}")
