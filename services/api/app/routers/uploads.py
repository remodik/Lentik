from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.uploads import resolve_upload_path
from app.db.deps import get_db
from app.models.chat import Chat
from app.models.user import User
from app.services.family import require_membership

router = APIRouter(prefix="/static/uploads", tags=["uploads"])


def _serve(stored_url: str) -> FileResponse:
    path = resolve_upload_path(stored_url)
    if not path or not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return FileResponse(
        path,
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/avatars/{filename}")
async def download_avatar(
    filename: str,
    _user: User = Depends(get_current_user),
):
    return _serve(f"/static/uploads/avatars/{filename}")


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
    return _serve(f"/static/uploads/chat_files/{chat_id}/{filename}")


@router.get("/{family_id}/{filename}")
async def download_family_file(
    family_id: UUID,
    filename: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_membership(family_id, user, db)
    return _serve(f"/static/uploads/{family_id}/{filename}")
