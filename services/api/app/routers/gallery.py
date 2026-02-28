import os
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.gallery_item import GalleryItem, MediaType
from app.models.membership import Membership
from app.models.user import User
from app.schemas.gallery import BulkDeleteRequest, GalleryItemResponse

router = APIRouter(prefix="/families/{family_id}/gallery", tags=["gallery"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
ALLOWED_IMAGES = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_VIDEOS = {".mp4", ".mov", ".avi", ".webm"}
MAX_FILE_SIZE = 50 * 1024 * 1024


async def _require_member(family_id: UUID, user: User, db: AsyncSession) -> Membership:
    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a family member")
    return m


def _item_to_response(item: GalleryItem) -> GalleryItemResponse:
    return GalleryItemResponse(
        id=item.id,
        family_id=item.family_id,
        uploaded_by=item.uploaded_by,
        uploaded_by_name=item.uploader.display_name if item.uploader else None,
        media_type=item.media_type,
        url=item.url,
        file_name=item.file_name,
        file_size=item.file_size,
        caption=item.caption,
        created_at=item.created_at,
    )


@router.get("", response_model=list[GalleryItemResponse])
async def list_gallery(
    family_id: UUID,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)
    items = await db.scalars(
        select(GalleryItem)
        .where(GalleryItem.family_id == family_id)
        .options(selectinload(GalleryItem.uploader))
        .order_by(GalleryItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_item_to_response(i) for i in items.all()]


@router.post("", response_model=GalleryItemResponse, status_code=status.HTTP_201_CREATED)
async def upload_to_gallery(
    family_id: UUID,
    file: UploadFile = File(...),
    caption: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    original_name = file.filename or "file"
    ext = Path(original_name).suffix.lower()

    if ext in ALLOWED_IMAGES:
        media_type = MediaType.IMAGE
    elif ext in ALLOWED_VIDEOS:
        media_type = MediaType.VIDEO
    else:
        raise HTTPException(status_code=415, detail="Неподдерживаемый формат файла")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Файл слишком большой (макс. 50 МБ)")

    dest_dir = UPLOAD_DIR / str(family_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    (dest_dir / filename).write_bytes(content)

    url = f"/static/uploads/{family_id}/{filename}"

    item = GalleryItem(
        family_id=family_id,
        uploaded_by=user.id,
        media_type=media_type,
        url=url,
        file_name=original_name,
        file_size=len(content),
        caption=caption,
    )
    db.add(item)
    await db.commit()

    item = await db.scalar(
        select(GalleryItem)
        .where(GalleryItem.id == item.id)
        .options(selectinload(GalleryItem.uploader))
    )
    return _item_to_response(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gallery_item(
    family_id: UUID,
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    item = await db.get(GalleryItem, item_id)
    if not item or item.family_id != family_id:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.uploaded_by != user.id and m.role != "owner":
        raise HTTPException(status_code=403, detail="Not allowed")

    file_path = UPLOAD_DIR / item.url.removeprefix("/static/uploads/")
    if file_path.exists():
        file_path.unlink()

    await db.delete(item)
    await db.commit()


@router.post("/bulk-delete", status_code=status.HTTP_204_NO_CONTENT)
async def bulk_delete_gallery(
    family_id: UUID,
    body: BulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    items = await db.scalars(
        select(GalleryItem).where(
            GalleryItem.family_id == family_id,
            GalleryItem.id.in_(body.ids),
        )
    )
    for item in items.all():
        if item.uploaded_by != user.id and m.role != "owner":
            continue
        file_path = UPLOAD_DIR / item.url.removeprefix("/static/uploads/")
        if file_path.exists():
            file_path.unlink()
        await db.delete(item)
    await db.commit()