import json
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
from app.schemas.channels import ChannelCreate, ChannelResponse, PostCreate, PostResponse

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
        created_by=user.id,
    )
    db.add(channel)
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
    m = await _require_member(family_id, user, db)
    if m.role != Role.OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can post to channels")

    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Channel not found")

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