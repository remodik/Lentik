import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.jwt import COOKIE_NAME, create_access_token
from app.core.security import hash_pin, verify_pin
from app.db.deps import get_db
from app.models.invite import Invite
from app.models.membership import Membership, Role
from app.models.user import User
from app.schemas.auth import JoinByInviteRequest, JoinByInviteResponse, RegisterRequest
from app.schemas.auth_pin import AuthPinRequest, AuthResponse

router = APIRouter(prefix="/auth", tags=["auth"])

TOKEN_MAX_AGE = 30 * 24 * 3600


async def _generate_suggestions(base: str, db: AsyncSession, count: int = 3) -> list[str]:
    suggestions = []
    attempts = 0
    while len(suggestions) < count and attempts < 20:
        attempts += 1
        suffix = "".join(random.choices(string.digits + string.ascii_lowercase, k=3))
        candidate = f"{base}_{suffix}"
        taken = await db.scalar(select(User.id).where(User.username == candidate))
        if not taken:
            suggestions.append(candidate)
    return suggestions


def _set_jwt_cookie(response: Response, user_id) -> None:
    token = create_access_token(user_id)
    response.set_cookie(
        key=COOKIE_NAME, value=token,
        httponly=True, secure=False, samesite="lax",
        max_age=TOKEN_MAX_AGE, path="/",
    )


@router.get("/check-username")
async def check_username(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    taken = await db.scalar(select(User.id).where(User.username == username))
    if not taken:
        return {"available": True, "suggestions": []}
    suggestions = await _generate_suggestions(username, db)
    return {"available": False, "suggestions": suggestions}


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(select(User).where(User.username == body.username))
    if existing:
        raise HTTPException(status_code=409, detail="Логин уже занят")

    user = User(
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_pin(body.pin),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    _set_jwt_cookie(response, user.id)
    return AuthResponse(user_id=str(user.id))


@router.post("/pin", response_model=AuthResponse)
async def login_by_pin(
    body: AuthPinRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.username == body.username))
    if not user or not verify_pin(body.pin, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверные данные")

    _set_jwt_cookie(response, user.id)
    return AuthResponse(user_id=str(user.id))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    _user: User = Depends(get_current_user),
):
    response.delete_cookie(key=COOKIE_NAME, path="/")


@router.post("/invite", response_model=JoinByInviteResponse, status_code=status.HTTP_201_CREATED)
async def join_by_invite(
    body: JoinByInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    invite = await db.scalar(select(Invite).where(Invite.token == body.token))
    if not invite:
        raise HTTPException(status_code=404, detail="Инвайт не найден")

    now = datetime.now(timezone.utc)
    expires = invite.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        raise HTTPException(status_code=400, detail="Инвайт истёк")

    base = body.display_name.strip().lower().replace(" ", "_")
    username = base
    i = 1
    while await db.scalar(select(User.id).where(User.username == username)):
        suffix = "".join(random.choices(string.digits + string.ascii_lowercase, k=3))
        username = f"{base}_{suffix}"
        i += 1

    user = User(
        username=username,
        display_name=body.display_name.strip(),
        password_hash=hash_pin(body.pin),
    )
    db.add(user)
    await db.flush()

    db.add(Membership(user_id=user.id, family_id=invite.family_id, role=Role.MEMBER))
    await db.commit()

    from app.ws.manager import ws_manager
    await ws_manager.broadcast_to_family(
        invite.family_id,
        {
            "type": "member_joined",
            "user_id": str(user.id),
            "display_name": user.display_name,
        },
    )

    return JoinByInviteResponse(user_id=user.id, family_id=invite.family_id)