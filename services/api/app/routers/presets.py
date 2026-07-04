"""Управление «готовыми» пресет-ботами семьи (трек D).

Пресет = `User(is_bot=True)` + `Membership` + строка `preset_bots` с конфигом.
Включать/настраивать может владелец или участник с правом MANAGE_FAMILY.
Бот-идентити создаётся лениво — при первом включении пресета.
"""

import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.core.permissions import Perm
from app.core.security import hash_pin
from app.db.deps import get_db
from app.models.chat import Chat
from app.models.membership import Membership, Role
from app.models.preset_bot import PresetBot
from app.models.user import User
from app.schemas.presets import PresetResponse, PresetUpdateRequest
from app.services.audit import log_action
from app.services.preset_bots import PRESETS, PresetMeta
from app.services.roles import assign_default_roles_on_join, require_family_perm

router = APIRouter(prefix="/families/{family_id}/presets", tags=["presets"])


async def _require_admin(family_id: UUID, user: User, db: AsyncSession) -> Membership:
    m = await db.scalar(
        select(Membership).where(
            Membership.family_id == family_id,
            Membership.user_id == user.id,
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a family member")
    await require_family_perm(db, m, Perm.MANAGE_FAMILY)
    return m


def _to_response(meta: PresetMeta, pb: PresetBot | None) -> PresetResponse:
    if pb is None:
        cfg = meta.default_config
        return PresetResponse(
            key=meta.key,
            title=meta.title,
            description=meta.description,
            emoji=meta.emoji,
            enabled=False,
            configured=False,
            hour=int(cfg.get("hour", 9)),
            tz_offset_minutes=int(cfg.get("tz_offset_minutes", 180)),
        )
    cfg = pb.config or {}
    return PresetResponse(
        key=meta.key,
        title=meta.title,
        description=meta.description,
        emoji=meta.emoji,
        enabled=pb.enabled,
        configured=True,
        target_chat_id=pb.target_chat_id,
        bot_user_id=pb.bot_user_id,
        bot_display_name=pb.bot_user.display_name if pb.bot_user else None,
        hour=int(cfg.get("hour", 9)),
        tz_offset_minutes=int(cfg.get("tz_offset_minutes", 180)),
        last_run_at=pb.last_run_at,
    )


async def _load_presets(family_id: UUID, db: AsyncSession) -> dict[str, PresetBot]:
    rows = await db.scalars(
        select(PresetBot)
        .where(PresetBot.family_id == family_id)
        .options(selectinload(PresetBot.bot_user))
    )
    return {pb.preset_key: pb for pb in rows.all()}


@router.get("", response_model=list[PresetResponse])
async def list_presets(
    family_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_admin(family_id, user, db)
    existing = await _load_presets(family_id, db)
    return [_to_response(meta, existing.get(key)) for key, meta in PRESETS.items()]


async def _create_bot_identity(
    family_id: UUID, meta: PresetMeta, db: AsyncSession
) -> User:
    # Уникальный username: preset-key + случайный суффикс (retry на коллизии).
    base = f"{meta.key}-bot"
    username = base
    while await db.scalar(select(User.id).where(User.username == username)):
        username = f"{base}-{secrets.token_hex(3)}"

    bot_user = User(
        username=username,
        display_name=meta.default_display_name,
        password_hash=hash_pin(secrets.token_hex(16)),
        is_bot=True,
    )
    db.add(bot_user)
    await db.flush()

    membership = Membership(family_id=family_id, user_id=bot_user.id, role=Role.MEMBER)
    db.add(membership)
    await db.flush()
    await assign_default_roles_on_join(db, membership)
    return bot_user


@router.put("/{key}", response_model=PresetResponse)
async def upsert_preset(
    family_id: UUID,
    key: str,
    body: PresetUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_admin(family_id, user, db)

    meta = PRESETS.get(key)
    if meta is None:
        raise HTTPException(status_code=404, detail="Unknown preset")

    if body.target_chat_id is not None:
        in_family = await db.scalar(
            select(Chat.id).where(
                Chat.id == body.target_chat_id, Chat.family_id == family_id
            )
        )
        if not in_family:
            raise HTTPException(status_code=400, detail="Chat not in this family")

    pb = await db.scalar(
        select(PresetBot)
        .where(PresetBot.family_id == family_id, PresetBot.preset_key == key)
        .options(selectinload(PresetBot.bot_user))
    )

    created = False
    if pb is None:
        bot_user = await _create_bot_identity(family_id, meta, db)
        pb = PresetBot(
            family_id=family_id,
            preset_key=key,
            bot_user_id=bot_user.id,
            enabled=False,
            config=dict(meta.default_config),
        )
        pb.bot_user = bot_user
        db.add(pb)
        created = True

    config = dict(pb.config or {})
    if body.hour is not None:
        config["hour"] = body.hour
    if body.tz_offset_minutes is not None:
        config["tz_offset_minutes"] = body.tz_offset_minutes
    pb.config = config

    if body.target_chat_id is not None:
        pb.target_chat_id = body.target_chat_id
    if body.enabled is not None:
        pb.enabled = body.enabled

    await log_action(
        db,
        family_id=family_id,
        actor_id=user.id,
        action="preset.created" if created else "preset.updated",
        target_type="preset",
        target_id=pb.bot_user_id,
        metadata={"preset": key, "enabled": pb.enabled},
    )
    await db.commit()
    await db.refresh(pb)
    await db.refresh(pb.bot_user)
    return _to_response(meta, pb)
