"""WS-gateway для ботов.

Бот подключается по WebSocket с bot-токеном (заголовок `Authorization: Bearer …`
или `?token=…`) и получает события семей в реальном времени — тот же поток, что
и люди (`new_message`, `reaction_added/removed`, `message_edited/deleted`,
`mention`, presence). Действия бот делает через REST (как у Discord: gateway —
события, REST — действия).

Реализация: при подключении регистрируем сокет бота во всех его семьях и во всех
видимых ему чатах через существующий `ws_manager`, поэтому правок в send-эндпоинтах
не нужно. Новые чаты, созданные ПОСЛЕ подключения, бот увидит после переподключения
(MVP-ограничение).

Аутентификация bot-токеном (не cookie), поэтому CSWSH-проверка Origin не нужна.
Бот не считается «онлайн» (presence не регистрируем) — чтобы не плодить
online/offline-шум.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth.bot_deps import extract_ws_bot_token, resolve_bot_user
from app.core.permissions import Perm, has_perm
from app.db.session import AsyncSessionLocal
from app.models.chat import Chat
from app.models.membership import Membership
from app.services.bans import is_banned_now
from app.services.roles import effective_permissions_for_chats
from sqlalchemy import select

from app.ws.manager import ws_manager

router = APIRouter(tags=["bot"])


@router.websocket("/bot/gateway")
async def bot_gateway(websocket: WebSocket):
    token = extract_ws_bot_token(websocket)

    registered_chats: list[UUID] = []
    registered_families: list[UUID] = []

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

        family_chats: dict[UUID, list[UUID]] = {}
        for m in memberships:
            chats = (
                await db.scalars(select(Chat).where(Chat.family_id == m.family_id))
            ).all()
            perms = await effective_permissions_for_chats(db, m, [c.id for c in chats])
            family_chats[m.family_id] = [
                c.id for c in chats if has_perm(perms.get(c.id, 0), Perm.VIEW_CHANNEL)
            ]

        bot_id = bot_user.id
        bot_username = bot_user.username
        bot_display = bot_user.display_name
        family_ids = [m.family_id for m in memberships]

    await websocket.accept()

    for fid in family_ids:
        await ws_manager.connect_family(fid, websocket, user_id=bot_id)
        registered_families.append(fid)
        for cid in family_chats.get(fid, []):
            await ws_manager.connect(cid, websocket, family_id=fid, user_id=bot_id)
            registered_chats.append(cid)

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
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        for cid in registered_chats:
            ws_manager.disconnect(cid, websocket)
        for fid in registered_families:
            ws_manager.disconnect_family(fid, websocket)
