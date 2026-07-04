"""WS-gateway для ботов (Phase 2).

Бот подключается по WebSocket с bot-токеном (заголовок `Authorization: Bearer …`
или `?token=…`) и получает события семей в реальном времени — тот же поток, что
и люди (`new_message`, `reaction_added/removed`, `message_edited/deleted`,
`mention`, `channel_post`, presence). Действия бот делает через REST (как у
Discord: gateway — события, REST — действия).

Реализация: при подключении сокет бота регистрируется во всех его семьях
(`connect_family`) и во всех видимых ему чатах (`connect`) через существующий
`ws_manager`, поэтому правок в send-эндпоинтах почти не нужно. Чаты, созданные
после подключения, подхватываются на каждом клиентском `ping` (re-sync).

Аутентификация bot-токеном (не cookie), поэтому CSWSH-проверка Origin не нужна.
Пока gateway подключён, бот считается «онлайн» (presence) — видно, что он запущен.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.bot_deps import extract_ws_bot_token, resolve_bot_user
from app.core.permissions import Perm, has_perm
from app.db.session import AsyncSessionLocal
from app.models.chat import Chat
from app.models.membership import Membership
from app.models.user import User
from app.services.bans import is_banned_now
from app.services.roles import effective_permissions_for_chats
from app.ws.manager import ws_manager

router = APIRouter(tags=["bot"])


async def _load_viewable_chats(
    db: AsyncSession, memberships: list[Membership]
) -> dict[UUID, set[UUID]]:
    """family_id → множество chat_id, которые бот может видеть (VIEW_CHANNEL)."""
    out: dict[UUID, set[UUID]] = {}
    for m in memberships:
        chats = (
            await db.scalars(select(Chat).where(Chat.family_id == m.family_id))
        ).all()
        perms = await effective_permissions_for_chats(db, m, [c.id for c in chats])
        out[m.family_id] = {
            c.id for c in chats if has_perm(perms.get(c.id, 0), Perm.VIEW_CHANNEL)
        }
    return out


def _presence_payload(family_id: UUID, user_id: UUID, is_online: bool, last_seen) -> dict:
    return {
        "type": "presence_update",
        "family_id": str(family_id),
        "user_id": str(user_id),
        "is_online": is_online,
        "last_seen_at": last_seen.isoformat() if last_seen else None,
    }


@router.websocket("/bot/gateway")
async def bot_gateway(websocket: WebSocket):
    token = extract_ws_bot_token(websocket)

    registered_chats: set[UUID] = set()

    # Короткоживущая сессия только на аутентификацию и загрузку чатов/семей.
    async with AsyncSessionLocal() as db:
        bot_user = await resolve_bot_user(db, token)
        if bot_user is None or is_banned_now(bot_user):
            await websocket.close(code=4001)
            return

        memberships = (
            await db.scalars(
                select(Membership).where(Membership.user_id == bot_user.id)
            )
        ).all()
        family_chats = await _load_viewable_chats(db, memberships)

        bot_id = bot_user.id
        bot_username = bot_user.username
        bot_display = bot_user.display_name
        last_seen = bot_user.last_seen_at
        family_ids = [m.family_id for m in memberships]

    await websocket.accept()

    # Регистрация на события: семьи (family-level) + видимые чаты.
    for fid in family_ids:
        await ws_manager.connect_family(fid, websocket, user_id=bot_id)
        for cid in family_chats.get(fid, set()):
            await ws_manager.connect(cid, websocket, family_id=fid, user_id=bot_id)
            registered_chats.add(cid)

    # B2 — presence. Счётчик присутствия глобален по user_id, поэтому регистрируем
    # один раз (на первую семью), а статус транслируем во все семьи.
    became_online = False
    if family_ids:
        became_online = await ws_manager.register_presence_connection(
            family_ids[0], bot_id, websocket
        )
    if became_online:
        async with AsyncSessionLocal() as db:
            u = await db.get(User, bot_id)
            if u and not u.is_online:
                u.is_online = True
                await db.commit()
                last_seen = u.last_seen_at
        for fid in family_ids:
            await ws_manager.broadcast_to_family(
                fid, _presence_payload(fid, bot_id, True, last_seen)
            )

    await websocket.send_json(
        {
            "type": "ready",
            "bot": {
                "id": str(bot_id),
                "username": bot_username,
                "display_name": bot_display,
            },
            "family_ids": [str(f) for f in family_ids],
        }
    )

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                # B1 — подхватываем чаты, созданные после подключения.
                async with AsyncSessionLocal() as db:
                    memberships = (
                        await db.scalars(
                            select(Membership).where(Membership.user_id == bot_id)
                        )
                    ).all()
                    fresh = await _load_viewable_chats(db, memberships)
                for fid, cids in fresh.items():
                    for cid in cids:
                        if cid not in registered_chats:
                            await ws_manager.connect(
                                cid, websocket, family_id=fid, user_id=bot_id
                            )
                            registered_chats.add(cid)
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        for cid in registered_chats:
            ws_manager.disconnect(cid, websocket)
        for fid in family_ids:
            ws_manager.disconnect_family(fid, websocket)

        became_offline = False
        if family_ids:
            became_offline = await ws_manager.unregister_presence_connection(
                family_ids[0], bot_id, websocket
            )
        if became_offline:
            offline_seen = datetime.now(timezone.utc)
            try:
                async with AsyncSessionLocal() as db:
                    u = await db.get(User, bot_id)
                    if u:
                        u.is_online = False
                        u.last_seen_at = offline_seen
                        await db.commit()
                        offline_seen = u.last_seen_at
            except Exception:  # noqa: BLE001
                pass
            for fid in family_ids:
                await ws_manager.broadcast_to_family(
                    fid, _presence_payload(fid, bot_id, False, offline_seen)
                )
