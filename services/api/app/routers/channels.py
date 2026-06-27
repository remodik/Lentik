import json
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.bot_deps import get_current_bot
from app.core.permissions import Perm, has_perm
from app.db.deps import get_db
from app.services.audit import log_action
from app.services.moderation import enforce_message_content, get_settings
from app.services.roles import (
    effective_permissions_for_channels,
    require_channel_perm,
    require_family_perm,
)
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
from app.schemas.bots import BotChannelInfo, BotPostRequest

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


async def _ensure_channel_18plus_perm(
    channel: Channel, membership: Membership, db: AsyncSession
) -> None:
    if not channel.is_18plus or membership.role.value == "owner":
        return
    from app.core.permissions import has_perm
    from app.services.roles import effective_permissions

    bits = await effective_permissions(db, membership.id)
    if not has_perm(bits, Perm.ACCESS_18PLUS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="У вашей роли нет права доступа к контенту 18+.",
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
    m = await _require_member(family_id, user, db)
    channels = (
        await db.scalars(select(Channel).where(Channel.family_id == family_id))
    ).all()
    # Скрываем каналы, на которые у участника снят VIEW_CHANNEL (owner видит все).
    perms = await effective_permissions_for_channels(db, m, [c.id for c in channels])
    return [c for c in channels if has_perm(perms.get(c.id, 0), Perm.VIEW_CHANNEL)]


@router.post("", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_channel(
    family_id: UUID,
    body: ChannelCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    await require_family_perm(db, m, Perm.MANAGE_CHANNELS)

    # Дефолтный слоумод из настроек модерации, если явно не задан.
    slow_mode = body.slow_mode_seconds
    if not slow_mode:
        mod = await get_settings(db, family_id)
        if mod and mod.slowmode_default_seconds:
            slow_mode = mod.slowmode_default_seconds

    channel = Channel(
        family_id=family_id,
        name=body.name,
        description=body.description,
        slow_mode_seconds=slow_mode,
        is_18plus=body.is_18plus,
        created_by=user.id,
    )
    db.add(channel)
    await db.flush()
    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="channel.created",
        target_type="channel",
        target_id=channel.id,
        metadata={"name": channel.name, "is_18plus": channel.is_18plus},
    )
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
    await require_channel_perm(db, m, channel_id, Perm.MANAGE_CHANNELS)

    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    updated = body.model_fields_set
    changes: dict[str, dict] = {}
    if "name" in updated and body.name is not None and body.name != channel.name:
        changes["name"] = {"from": channel.name, "to": body.name}
        channel.name = body.name
    if "description" in updated and body.description != channel.description:
        changes["description"] = {"from": channel.description, "to": body.description}
        channel.description = body.description
    if (
        "slow_mode_seconds" in updated
        and body.slow_mode_seconds is not None
        and body.slow_mode_seconds != channel.slow_mode_seconds
    ):
        changes["slow_mode_seconds"] = {
            "from": channel.slow_mode_seconds,
            "to": body.slow_mode_seconds,
        }
        channel.slow_mode_seconds = body.slow_mode_seconds
    if (
        "is_18plus" in updated
        and body.is_18plus is not None
        and body.is_18plus != channel.is_18plus
    ):
        changes["is_18plus"] = {"from": channel.is_18plus, "to": body.is_18plus}
        channel.is_18plus = body.is_18plus

    if changes:
        await log_action(
            db,
            family_id=family_id,
            actor_id=user.id,
            action="channel.updated",
            target_type="channel",
            target_id=channel_id,
            metadata={"name": channel.name, "changes": changes},
        )
    await db.commit()
    await db.refresh(channel)
    return channel


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(
    family_id: UUID,
    channel_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)
    await require_channel_perm(db, m, channel_id, Perm.MANAGE_CHANNELS)

    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="channel.deleted",
        target_type="channel",
        target_id=channel.id,
        metadata={"name": channel.name},
    )
    # Посты и permission-оверрайды канала удаляются каскадом (FK ondelete=CASCADE
    # + relationship cascade на Channel.posts).
    await db.delete(channel)
    await db.commit()


@router.get("/{channel_id}/posts", response_model=list[PostResponse])
async def list_posts(
    family_id: UUID,
    channel_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await _require_member(family_id, user, db)

    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    # Доступ к каналу (VIEW_CHANNEL) и к его истории постов (READ_HISTORY).
    await require_channel_perm(db, m, channel_id, Perm.VIEW_CHANNEL, Perm.READ_HISTORY)
    _ensure_age_gate(channel, user)
    await _ensure_channel_18plus_perm(channel, m, db)

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
    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    await require_channel_perm(db, membership, channel_id, Perm.VIEW_CHANNEL, Perm.SEND_MESSAGES)

    _ensure_age_gate(channel, user)
    await _ensure_channel_18plus_perm(channel, membership, db)
    await _enforce_slow_mode(channel, user, membership, db)

    enforce_message_content(await get_settings(db, family_id), body.text)

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


# ── Bot Dev API для каналов (аутентификация bot-токеном) ─────────────────────
bot_router = APIRouter(prefix="/bot", tags=["bot"])


@bot_router.get("/families/{family_id}/channels", response_model=list[BotChannelInfo])
async def bot_list_channels(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    bot_user: User = Depends(get_current_bot),
):
    """Каналы, видимые боту (VIEW_CHANNEL) — чтобы бот находил channel_id сам."""
    m = await _require_member(family_id, bot_user, db)
    channels = (
        await db.scalars(select(Channel).where(Channel.family_id == family_id))
    ).all()
    perms = await effective_permissions_for_channels(db, m, [c.id for c in channels])
    return [
        BotChannelInfo(id=c.id, name=c.name, is_18plus=c.is_18plus)
        for c in channels
        if has_perm(perms.get(c.id, 0), Perm.VIEW_CHANNEL)
    ]


@bot_router.get(
    "/families/{family_id}/channels/{channel_id}/posts",
    response_model=list[PostResponse],
)
async def bot_list_posts(
    family_id: UUID,
    channel_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    bot_user: User = Depends(get_current_bot),
):
    m = await _require_member(family_id, bot_user, db)

    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    await require_channel_perm(db, m, channel_id, Perm.VIEW_CHANNEL, Perm.READ_HISTORY)
    _ensure_age_gate(channel, bot_user)
    await _ensure_channel_18plus_perm(channel, m, db)

    posts = await db.scalars(
        select(Post)
        .where(Post.channel_id == channel_id)
        .order_by(Post.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return posts.all()


@bot_router.post(
    "/families/{family_id}/channels/{channel_id}/posts",
    response_model=PostResponse,
    status_code=status.HTTP_201_CREATED,
)
async def bot_create_post(
    family_id: UUID,
    channel_id: UUID,
    body: BotPostRequest,
    db: AsyncSession = Depends(get_db),
    bot_user: User = Depends(get_current_bot),
):
    membership = await _require_member(family_id, bot_user, db)
    channel = await db.get(Channel, channel_id)
    if not channel or channel.family_id != family_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    await require_channel_perm(db, membership, channel_id, Perm.VIEW_CHANNEL, Perm.SEND_MESSAGES)
    _ensure_age_gate(channel, bot_user)
    await _ensure_channel_18plus_perm(channel, membership, db)
    await _enforce_slow_mode(channel, bot_user, membership, db)

    enforce_message_content(await get_settings(db, family_id), body.text)

    post = Post(
        channel_id=channel_id,
        author_id=bot_user.id,
        text=body.text,
        media_urls=None,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post