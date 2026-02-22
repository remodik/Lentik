import os
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.gallery_item import GalleryItem, MediaType
from app.models.membership import Membership
from app.models.user import User
from app.schemas.gallery import GalleryItemResponse

router = APIRouter(prefix="/families/{family_id}/gallery", tags=["gallery"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
ALLOWED_IMAGES = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_VIDEOS = {".mp4", ".mov", ".avi"}
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


@router.get("", response_model=list[GalleryItemResponse])
async def list_gallery(
    family_id: UUID,
    limit: int = 30,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)
    items = await db.scalars(
        select(GalleryItem)
        .where(GalleryItem.family_id == family_id)
        .order_by(GalleryItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return items.all()


@router.post("", response_model=GalleryItemResponse, status_code=status.HTTP_201_CREATED)
async def upload_to_gallery(
    family_id: UUID,
    file: UploadFile = File(...),
    caption: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    ext = Path(file.filename or "").suffix.lower()
    if ext in ALLOWED_IMAGES:
        media_type = MediaType.IMAGE
    elif ext in ALLOWED_VIDEOS:
        media_type = MediaType.VIDEO
    else:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    dest_dir = UPLOAD_DIR / str(family_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    dest = dest_dir / filename
    dest.write_bytes(content)

    url = f"/static/uploads/{family_id}/{filename}"

    item = GalleryItem(
        family_id=family_id,
        uploaded_by=user.id,
        media_type=media_type,
        url=url,
        caption=caption,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gallery_item(
    family_id: UUID,
    item_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    item = await db.get(GalleryItem, item_id)
    if not item or item.family_id != family_id:
        raise HTTPException(status_code=404, detail="Item not found")

    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user.id,
        )
    )
    if item.uploaded_by != user.id and m.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    file_path = UPLOAD_DIR / item.url.removeprefix("/static/uploads/")
    if file_path.exists():
        file_path.unlink()

    await db.delete(item)
    await db.commit()