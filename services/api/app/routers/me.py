import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.membership import Membership
from app.models.user import User
from app.schemas.me import MeResponse, UpdateProfileRequest

import os

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads")) / "avatars"
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MAX_SIZE = 5 * 1024 * 1024  # 5 MB

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=MeResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.patch("", response_model=MeResponse)
async def update_profile(
    body: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.username is not None:
        existing = await db.scalar(select(User).where(User.username == body.username))
        if existing and existing.id != user.id:
            raise HTTPException(status_code=409, detail="Username already taken")
        user.username = body.username

    await db.commit()
    await db.refresh(user)
    return user


@router.post("/avatar", response_model=MeResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    (UPLOAD_DIR / filename).write_bytes(content)

    if user.avatar_url:
        old_path = Path("uploads") / user.avatar_url.removeprefix("/static/uploads/")
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    user.avatar_url = f"/static/uploads/avatars/{filename}"
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/families", response_model=list[dict])
async def my_families(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    memberships = await db.scalars(
        select(Membership).where(Membership.user_id == user.id)
    )
    return [
        {"family_id": str(m.family_id), "role": m.role, "joined_at": m.created_at.isoformat()}
        for m in memberships.all()
    ]


@router.delete("/families/{family_id}", status_code=status.HTTP_204_NO_CONTENT)
async def leave_family(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status_code=404, detail="You are not in this family")

    if m.role == "owner":
        raise HTTPException(
            status_code=400,
            detail="Transfer ownership before leaving",
        )

    await db.delete(m)
    await db.commit()