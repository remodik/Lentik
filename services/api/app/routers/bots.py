"""Управление ботами семьи (Фаза 1, Dev API).

Бот = `User(is_bot=True)` + `Membership`, поэтому права/роли переиспользуются.
Создавать/настраивать ботов может владелец или участник с правом MANAGE_FAMILY.
"""

import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.core.bot_tokens import (
    generate_bot_token,
    hash_bot_token,
    token_display_prefix,
)
from app.core.permissions import Perm
from app.core.security import hash_pin
from app.db.deps import get_db
from app.models.bot import Bot
from app.models.membership import Membership, Role
from app.models.user import User
from app.schemas.bots import BotCreate, BotResponse, BotWithToken
from app.services.audit import log_action
from app.services.roles import assign_default_roles_on_join, require_family_perm

router = APIRouter(prefix="/families/{family_id}/bots", tags=["bots"])


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


async def _require_bot_admin(family_id: UUID, user: User, db: AsyncSession) -> Membership:
    m = await _require_member(family_id, user, db)
    await require_family_perm(db, m, Perm.MANAGE_FAMILY)
    return m


def _to_response(bot: Bot, bot_user: User) -> BotResponse:
    return BotResponse(
        id=bot.id,
        user_id=bot_user.id,
        username=bot_user.username,
        display_name=bot_user.display_name,
        avatar_url=bot_user.avatar_url,
        description=bot.description,
        owner_id=bot.owner_id,
        token_prefix=bot.token_prefix,
        created_at=bot.created_at,
    )


async def _get_family_bot(family_id: UUID, bot_id: UUID, db: AsyncSession) -> tuple[Bot, User]:
    bot = await db.get(Bot, bot_id)
    if bot is None:
        raise HTTPException(status_code=404, detail="Bot not found")
    # Бот должен быть участником ИМЕННО этой семьи (скоуп).
    in_family = await db.scalar(
        select(Membership.id).where(
            Membership.family_id == family_id,
            Membership.user_id == bot.user_id,
        )
    )
    if not in_family:
        raise HTTPException(status_code=404, detail="Bot not found")
    bot_user = await db.get(User, bot.user_id)
    if bot_user is None:
        raise HTTPException(status_code=404, detail="Bot not found")
    return bot, bot_user


@router.get("", response_model=list[BotResponse])
async def list_bots(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_bot_admin(family_id, user, db)
    rows = await db.execute(
        select(Bot, User)
        .join(User, Bot.user_id == User.id)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.family_id == family_id)
    )
    return [_to_response(bot, bot_user) for bot, bot_user in rows.all()]


@router.post("", response_model=BotWithToken, status_code=status.HTTP_201_CREATED)
async def create_bot(
    family_id: UUID,
    body: BotCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_bot_admin(family_id, user, db)

    username = body.username.strip()
    if await db.scalar(select(User.id).where(User.username == username)):
        raise HTTPException(status_code=409, detail="Имя пользователя уже занято")

    # Неюзабельный пароль: валидный по формату хеш случайного секрета, который
    # никто не знает. Плюс is_bot отдельно блокирует логин (см. auth.py).
    bot_user = User(
        username=username,
        display_name=body.display_name.strip(),
        password_hash=hash_pin(secrets.token_hex(16)),
        is_bot=True,
    )
    db.add(bot_user)
    await db.flush()

    membership = Membership(family_id=family_id, user_id=bot_user.id, role=Role.MEMBER)
    db.add(membership)
    await db.flush()
    await assign_default_roles_on_join(db, membership)

    raw_token = generate_bot_token()
    bot = Bot(
        user_id=bot_user.id,
        owner_id=user.id,
        token_hash=hash_bot_token(raw_token),
        token_prefix=token_display_prefix(raw_token),
        description=(body.description or "").strip() or None,
    )
    db.add(bot)

    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="bot.created",
        target_type="bot",
        target_id=bot_user.id,
        metadata={"username": username, "display_name": bot_user.display_name},
    )
    await db.commit()
    await db.refresh(bot)
    await db.refresh(bot_user)

    return BotWithToken(**_to_response(bot, bot_user).model_dump(), token=raw_token)


@router.post("/{bot_id}/token", response_model=BotWithToken)
async def regenerate_token(
    family_id: UUID,
    bot_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_bot_admin(family_id, user, db)
    bot, bot_user = await _get_family_bot(family_id, bot_id, db)

    raw_token = generate_bot_token()
    bot.token_hash = hash_bot_token(raw_token)
    bot.token_prefix = token_display_prefix(raw_token)

    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="bot.token_regenerated",
        target_type="bot",
        target_id=bot_user.id,
        metadata={"username": bot_user.username},
    )
    await db.commit()
    await db.refresh(bot)

    return BotWithToken(**_to_response(bot, bot_user).model_dump(), token=raw_token)


@router.delete("/{bot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bot(
    family_id: UUID,
    bot_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_bot_admin(family_id, user, db)
    bot, bot_user = await _get_family_bot(family_id, bot_id, db)

    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="bot.deleted",
        target_type="bot",
        target_id=bot_user.id,
        metadata={"username": bot_user.username},
    )
    # Удаляем identity-пользователя бота: membership/роли удаляются каскадом,
    # прошлые сообщения бота остаются (Message.author_id = SET NULL).
    await db.delete(bot_user)
    await db.commit()
