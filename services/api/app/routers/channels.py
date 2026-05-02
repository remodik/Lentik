import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.deps import get_db
from app.models.channel import Channel
from app.models.membership import Membership, Role
from app.models.post import Post
from app.models.user import User
from app.schemas.channels import (
    ChannelCreate,
    ChannelResponse,
    ChannelUpdate,
    PostCreate,
    PostResponse,
)

router = APIRouter(prefix="/families/{family_id}/channels", tags=["channels"])


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


def _user_age_years(user: User) -> int | None:
    if not user.birthday:
        return None
    today = datetime.now(timezone.utc).date()
    bd = user.birthday
    age = today.year - bd.year - (
        (today.month, today.day) < (bd.month, bd.day)
    )
    return max(0, age)


def _ensure_age_gate(channel: Channel, user: User) -> None:
    if not channel.is_18plus:
        return
    age = _user_age_years(user)
    if age is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Канал 18+. Заполните дату рождения в профиле.",
        )
    if age < 18:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Канал 18+. Доступ запрещён.",
        )


async def _enforce_slow_mode(
    channel: Channel,
    user: User,
    membership: Membership,
    db: AsyncSession,
) -> None:
    if not channel.slow_mode_seconds or channel.slow_mode_seconds <= 0:
        return
    if membership.role == Role.OWNER:
        return

    last = await db.scalar(
        select(Post)
        .where(Post.channel_id == channel.id, Post.author_id == user.id)
        .order_by(Post.created_at.desc())
        .limit(1)
    )
    if not last:
        return

    now = datetime.now(timezone.utc)
    elapsed = (now - last.created_at).total_seconds()
    remaining = int(channel.slow_mode_seconds - elapsed)
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Медленный режим: подождите ещё {remaining} с перед следующей публикацией."
            ),
            headers={"Retry-After": str(remaining)},
        )


@router.get("", response_model=list[ChannelResponse])
async def list_channels(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)
    channels = await db.scalars(select(Channel).where(Channel.family_id == family_id))
    return channels.all()


@router.post("", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_channel(
    family_id: UUID,
    body: ChannelCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    if m.role != Role.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can create channels")

    channel = Channel(
        family_id=family_id,
        name=body.name,
        description=body.description,
        slow_mode_seconds=body.slow_mode_seconds,
        is_18plus=body.is_18plus,
        created_by=user.id,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return channel


@router.patch("/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    family_id: UUID,
    channel_id: UUID,
    body: ChannelUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    if m.role != Role.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner can edit channel settings",
        )

    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    updated = body.model_fields_set
    if "name" in updated and body.name is not None:
        channel.name = body.name
    if "description" in updated:
        channel.description = body.description
    if "slow_mode_seconds" in updated and body.slow_mode_seconds is not None:
        channel.slow_mode_seconds = body.slow_mode_seconds
    if "is_18plus" in updated and body.is_18plus is not None:
        channel.is_18plus = body.is_18plus

    await db.commit()
    await db.refresh(channel)
    return channel


@router.get("/{channel_id}/posts", response_model=list[PostResponse])
async def list_posts(
    family_id: UUID,
    channel_id: UUID,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_member(family_id, user, db)

    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    _ensure_age_gate(channel, user)

    posts = await db.scalars(
        select(Post)
        .where(Post.channel_id == channel_id)
        .order_by(Post.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return posts.all()


@router.post("/{channel_id}/posts", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_post(
    family_id: UUID,
    channel_id: UUID,
    body: PostCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await _require_member(family_id, user, db)
    if membership.role != Role.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can post to channels")

    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    _ensure_age_gate(channel, user)
    await _enforce_slow_mode(channel, user, membership, db)

    post = Post(
        channel_id=channel_id,
        author_id=user.id,
        text=body.text,
        media_urls=json.dumps(body.media_urls) if body.media_urls else None,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post