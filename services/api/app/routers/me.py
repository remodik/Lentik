import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.security import hash_pin, verify_pin
from app.db.deps import get_db
from app.models.family import Family
from app.models.membership import Membership
from app.models.user import User
from app.schemas.me import (
    ChangePinRequest, MeResponse, MyFamilyResponse,
    UpdateProfileRequest,
)

import os

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads")) / "avatars"
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
MAX_SIZE = 5 * 1024 * 1024

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
    if body.display_name is not None:
        user.display_name = body.display_name

    if body.username is not None:
        existing = await db.scalar(select(User).where(User.username == body.username))
        if existing and existing.id != user.id:
            raise HTTPException(status_code=409, detail="Логин уже занят")
        user.username = body.username

    if body.bio is not None:
        user.bio = body.bio

    if body.birthday is not None:
        user.birthday = body.birthday

    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/pin", status_code=status.HTTP_204_NO_CONTENT)
async def change_pin(
    body: ChangePinRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_pin(body.current_pin, user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный текущий PIN")
    user.password_hash = hash_pin(body.new_pin)
    await db.commit()


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

    filename = f"{uuid.uuid4()}{ext}"
    dest = UPLOAD_DIR / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)

    if user.avatar_url:
        old_path = Path("uploads") / user.avatar_url.removeprefix("/static/uploads/")
        old_path.unlink(missing_ok=True)

    user.avatar_url = f"/static/uploads/avatars/{filename}"
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/families", response_model=list[MyFamilyResponse])
async def my_families(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = await db.execute(
        select(Membership, Family)
        .join(Family, Family.id == Membership.family_id)
        .where(Membership.user_id == user.id)
        .order_by(Membership.created_at)
    )
    return [
        MyFamilyResponse(
            family_id=m.family_id,
            family_name=f.name,
            role=m.role,
            joined_at=m.created_at,
        )
        for m, f in rows.all()
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
        raise HTTPException(status_code=400, detail="Transfer ownership before leaving")

    await db.delete(m)
    await db.commit()