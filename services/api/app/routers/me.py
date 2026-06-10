import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.config import settings
from app.core.cookies import set_auth_cookie
from app.core.jwt import create_access_token
from app.core.file_signatures import enforce_safe_signature
from app.core.security import hash_pin, verify_pin
from app.core.storage import storage
from app.services.push import is_push_enabled
from app.ws.manager import ws_manager
from app.db.deps import get_db
from app.models.family import Family
from app.models.membership import Membership
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.schemas.me import (
    ChangePinRequest, MeResponse, MyFamilyResponse,
    PushPublicKeyResponse, PushSubscribeRequest, PushUnsubscribeRequest,
    UpdateProfileRequest,
)

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

    if body.ui_mode is not None:
        user.ui_mode = body.ui_mode

    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/pin", status_code=status.HTTP_204_NO_CONTENT)
async def change_pin(
    body: ChangePinRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_pin(body.current_pin, user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный текущий PIN")
    user.password_hash = hash_pin(body.new_pin)
    # Отозвать все ранее выпущенные JWT этого пользователя (включая
    # потенциально украденные). Текущая сессия получит свежую cookie ниже.
    user.password_changed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    # Текущая сессия получает свежую cookie (параметры — в core/cookies).
    fresh_token = create_access_token(user.id, not_before=user.password_changed_at)
    set_auth_cookie(response, fresh_token)


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
    enforce_safe_signature(ext, content)

    filename = f"{uuid.uuid4()}{ext}"
    try:
        await storage.save(f"avatars/{filename}", content, file.content_type)
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail="Не удалось сохранить аватар. Проверьте права на папку загрузок.",
        ) from exc

    if user.avatar_url:
        await storage.delete_by_url(user.avatar_url)

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
    await ws_manager.kick_user_from_family(family_id, user.id)


# ─── Web Push (VAPID) подписки ──────────────────────────────────────────────


@router.get("/push/public-key", response_model=PushPublicKeyResponse)
async def get_push_public_key():
    """Публичный VAPID-ключ для подписки на push. Фронт по `enabled=false`
    просто не предлагает уведомления."""
    return PushPublicKeyResponse(
        enabled=is_push_enabled(),
        public_key=settings.vapid_public_key if is_push_enabled() else None,
    )


@router.post("/push/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe_push(
    body: PushSubscribeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Upsert по endpoint: если этот браузер уже подписан (возможно, под другим
    # пользователем на общем устройстве) — перепривязываем к текущему.
    existing = await db.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    if existing:
        existing.user_id = user.id
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
    else:
        db.add(
            PushSubscription(
                user_id=user.id,
                endpoint=body.endpoint,
                p256dh=body.keys.p256dh,
                auth=body.keys.auth,
            )
        )
    await db.commit()


@router.post("/push/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe_push(
    body: PushUnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    await db.commit()
