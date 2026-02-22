from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_pin
from app.core.security import verify_pin
from app.core.sessions import COOKIE_NAME, new_session_token, hash_token, expires_at
from app.db.deps import get_db
from app.models.invite import Invite
from app.models.membership import Membership, Role
from app.models.session import Session
from app.models.user import User
from app.schemas.auth_pin import AuthPinRequest, AuthResponse
from app.schemas.auth import JoinByInviteRequest, JoinByInviteResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/invite", response_model=JoinByInviteResponse, status_code=status.HTTP_201_CREATED)
async def join_by_invite(
    body: JoinByInviteRequest,
    db: AsyncSession = Depends(get_db),
) -> JoinByInviteResponse:
    result = await db.execute(select(Invite).where(Invite.token == body.token))
    invite = result.scalar_one_or_none()

    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    now = datetime.now(timezone.utc)
    expires_at = invite.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        raise HTTPException(status_code=400, detail="Invite has expired")

    family_id = invite.family_id

    base_username = body.display_name.strip()
    username = base_username

    i = 1
    while await db.scalar(select(User.id).where(User.username == username)):
        username = f"{base_username}_{i}"
        i += 1

    user = User(
        username=username,
        password_hash=hash_pin(body.pin),
    )
    db.add(user)
    await db.flush()

    membership = Membership(
        user_id=user.id,
        family_id=family_id,
        role=Role.MEMBER,
    )
    db.add(membership)

    await db.delete(invite)

    await db.commit()
    await db.refresh(user)

    return JoinByInviteResponse(user_id=user.id, family_id=family_id)


@router.post("/pin", response_model=AuthResponse)
async def login_by_pin(
    body: AuthPinRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.username == body.username))
    if not user or not user.password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_pin(body.pin, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = new_session_token()
    sess = Session(
        user_id=user.id,
        token_hash=hash_token(token),
        created_at=datetime.now(timezone.utc),
        expires_at=expires_at(),
    )
    db.add(sess)
    await db.commit()

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=30 * 24 * 3600,
        path="/",
    )

    return AuthResponse(user_id=str(user.id))