"""WebSocket-менеджер с опциональным fan-out через Redis (P1).

Без `REDIS_URL` работает как раньше — single-process, рассылка только локальным
сокетам. С Redis: `broadcast_*` публикует событие в общий канал, а подписчик на
каждом инстансе доставляет его СВОИМ локальным сокетам. Так сообщения доходят до
пользователей, подключённых к другим инстансам/воркерам.

Контроль присутствия (online/offline) при нескольких инстансах ведётся счётчиком
в Redis (`ws:presence:{user_id}`).
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket

from app.core import redis_client

logger = logging.getLogger(__name__)

# Один общий канal для всех типов событий — без динамической подписки на чат.
_CHANNEL = "lentik:ws"
# Защитный TTL на счётчик присутствия, чтобы аварийно «утёкший» инкремент
# (процесс умер без decr) сам истёк, а не держал пользователя online вечно.
_PRESENCE_TTL = 60 * 60 * 24


class ConnectionManager:
    def __init__(self) -> None:
        self._chat_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._family_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._presence_connections: dict[UUID, dict[UUID, set[WebSocket]]] = defaultdict(
            lambda: defaultdict(set)
        )
        self._user_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._family_user_sockets: dict[UUID, dict[UUID, set[WebSocket]]] = defaultdict(
            lambda: defaultdict(set)
        )
        self._sub_task: asyncio.Task | None = None
        self._pubsub = None

    # ── Жизненный цикл Redis-подписчика ─────────────────────────────────────

    async def start(self) -> None:
        r = await redis_client.get_redis()
        if r is None:
            return
        try:
            self._pubsub = r.pubsub()
            await self._pubsub.subscribe(_CHANNEL)
            self._sub_task = asyncio.create_task(self._listen(), name="ws-redis-sub")
            logger.info("WS Redis fan-out enabled")
        except Exception:  # noqa: BLE001
            logger.exception("Failed to start WS Redis subscriber; local-only mode")
            self._pubsub = None
            self._sub_task = None

    async def stop(self) -> None:
        if self._sub_task is not None:
            self._sub_task.cancel()
            try:
                await self._sub_task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
            self._sub_task = None
        if self._pubsub is not None:
            try:
                await self._pubsub.unsubscribe(_CHANNEL)
                await self._pubsub.aclose()
            except Exception:  # noqa: BLE001
                pass
            self._pubsub = None

    async def _listen(self) -> None:
        assert self._pubsub is not None
        try:
            async for message in self._pubsub.listen():
                if not message or message.get("type") != "message":
                    continue
                try:
                    env = json.loads(message["data"])
                except Exception:  # noqa: BLE001
                    continue
                try:
                    await self._handle_envelope(env)
                except Exception:  # noqa: BLE001
                    logger.exception("ws envelope handling failed")
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("ws redis subscriber crashed")

    async def _handle_envelope(self, env: dict) -> None:
        kind = env.get("kind")
        if kind == "chat":
            await self._deliver_to_chat(UUID(env["id"]), env["payload"])
        elif kind == "family":
            await self._deliver_to_family(UUID(env["id"]), env["payload"])
        elif kind == "kick":
            await self._close_family_user(UUID(env["family_id"]), UUID(env["user_id"]))
        elif kind == "family_close":
            await self._close_family_all(UUID(env["id"]))
        elif kind == "force_logout":
            await self._force_logout_user(UUID(env["user_id"]))

    async def _publish(self, env: dict) -> bool:
        """Опубликовать событие в Redis. True — опубликовано (доставку сделает
        подписчик на всех инстансах, включая этот). False — Redis нет, доставляем
        локально сами."""
        r = await redis_client.get_redis()
        if r is None or self._pubsub is None:
            return False
        try:
            await r.publish(_CHANNEL, json.dumps(env, ensure_ascii=False))
            return True
        except Exception:  # noqa: BLE001
            logger.exception("ws publish failed; falling back to local delivery")
            return False

    # ── Регистрация соединений (локальные реестры) ──────────────────────────

    async def connect(
        self,
        chat_id: UUID,
        ws: WebSocket,
        *,
        family_id: UUID | None = None,
        user_id: UUID | None = None,
    ) -> None:
        self._chat_connections[chat_id].add(ws)
        if family_id is not None and user_id is not None:
            self._family_user_sockets[family_id][user_id].add(ws)

    def disconnect(self, chat_id: UUID, ws: WebSocket) -> None:
        self._chat_connections[chat_id].discard(ws)
        if not self._chat_connections[chat_id]:
            del self._chat_connections[chat_id]
        self._remove_from_family_user_index(ws)

    async def connect_family(
        self,
        family_id: UUID,
        ws: WebSocket,
        *,
        user_id: UUID | None = None,
    ) -> None:
        self._family_connections[family_id].add(ws)
        if user_id is not None:
            self._family_user_sockets[family_id][user_id].add(ws)

    def disconnect_family(self, family_id: UUID, ws: WebSocket) -> None:
        self._family_connections[family_id].discard(ws)
        if not self._family_connections[family_id]:
            del self._family_connections[family_id]
        self._remove_from_family_user_index(ws)

    def _remove_from_family_user_index(self, ws: WebSocket) -> None:
        for family_id, by_user in list(self._family_user_sockets.items()):
            for user_id, sockets in list(by_user.items()):
                sockets.discard(ws)
                if not sockets:
                    del by_user[user_id]
            if not by_user:
                del self._family_user_sockets[family_id]

    # ── Присутствие (online/offline) ────────────────────────────────────────

    async def register_presence_connection(
        self,
        family_id: UUID,
        user_id: UUID,
        ws: WebSocket,
    ) -> bool:
        """Регистрирует соединение. Возвращает True, если это ПЕРВОЕ активное
        соединение пользователя (во всём кластере при Redis, иначе локально) —
        т.е. пользователь только что стал online."""
        self._presence_connections[family_id][user_id].add(ws)
        local = self._user_connections[user_id]
        was_locally_offline = len(local) == 0
        local.add(ws)

        r = await redis_client.get_redis()
        if r is not None:
            try:
                count = await r.incr(f"ws:presence:{user_id}")
                await r.expire(f"ws:presence:{user_id}", _PRESENCE_TTL)
                return count == 1
            except Exception:  # noqa: BLE001
                logger.exception("presence incr failed; using local state")
        return was_locally_offline

    async def unregister_presence_connection(
        self,
        family_id: UUID,
        user_id: UUID,
        ws: WebSocket,
    ) -> bool:
        """Снимает соединение. Возвращает True, если это было ПОСЛЕДНЕЕ активное
        соединение пользователя — т.е. пользователь стал offline."""
        family_connections = self._presence_connections.get(family_id)
        if family_connections:
            user_connections = family_connections.get(user_id)
            if user_connections:
                user_connections.discard(ws)
                if not user_connections:
                    del family_connections[user_id]
                if not family_connections:
                    del self._presence_connections[family_id]

        local = self._user_connections.get(user_id)
        local_became_empty = False
        if local is not None:
            local.discard(ws)
            if not local:
                del self._user_connections[user_id]
                local_became_empty = True

        r = await redis_client.get_redis()
        if r is not None:
            try:
                count = await r.decr(f"ws:presence:{user_id}")
                if count <= 0:
                    # Не даём счётчику уйти в минус из-за дрейфа.
                    await r.delete(f"ws:presence:{user_id}")
                    return True
                return False
            except Exception:  # noqa: BLE001
                logger.exception("presence decr failed; using local state")
        return local_became_empty

    # ── Рассылка ────────────────────────────────────────────────────────────

    async def broadcast_to_chat(self, chat_id: UUID, payload: dict) -> None:
        if await self._publish({"kind": "chat", "id": str(chat_id), "payload": payload}):
            return
        await self._deliver_to_chat(chat_id, payload)

    async def broadcast_to_family(self, family_id: UUID, payload: dict) -> None:
        if await self._publish({"kind": "family", "id": str(family_id), "payload": payload}):
            return
        await self._deliver_to_family(family_id, payload)

    async def _deliver_to_chat(self, chat_id: UUID, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._chat_connections.get(chat_id, [])):
            try:
                await ws.send_text(json.dumps(payload, ensure_ascii=False))
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.disconnect(chat_id, ws)

    async def _deliver_to_family(self, family_id: UUID, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._family_connections.get(family_id, [])):
            try:
                await ws.send_text(json.dumps(payload, ensure_ascii=False))
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            self.disconnect_family(family_id, ws)

    # ── Принудительное закрытие соединений ──────────────────────────────────

    async def kick_user_from_family(self, family_id: UUID, user_id: UUID) -> None:
        """Закрыть все WS-соединения пользователя в семье на ВСЕХ инстансах
        (после kick/leave) — иначе отозванный продолжит получать broadcast
        на другом инстансе (CWE-613)."""
        if await self._publish(
            {"kind": "kick", "family_id": str(family_id), "user_id": str(user_id)}
        ):
            return
        await self._close_family_user(family_id, user_id)

    async def _close_family_user(self, family_id: UUID, user_id: UUID) -> None:
        by_user = self._family_user_sockets.get(family_id)
        if not by_user:
            return
        sockets = by_user.get(user_id)
        if not sockets:
            return
        for ws in list(sockets):
            try:
                await ws.close(code=4003)
            except Exception:  # noqa: BLE001
                pass
            for chat_id, conns in list(self._chat_connections.items()):
                conns.discard(ws)
                if not conns:
                    del self._chat_connections[chat_id]
            self._family_connections.get(family_id, set()).discard(ws)
        by_user.pop(user_id, None)
        if not by_user:
            self._family_user_sockets.pop(family_id, None)

    async def force_logout_user(self, user_id: UUID) -> None:
        """Разослать пользователю событие force_logout и закрыть его сокеты на
        ВСЕХ инстансах (после глобального бана). Клиент по этому событию чистит
        сессию и уходит на /login."""
        if await self._publish({"kind": "force_logout", "user_id": str(user_id)}):
            return
        await self._force_logout_user(user_id)

    async def _force_logout_user(self, user_id: UUID) -> None:
        # Собираем все известные сокеты пользователя из всех локальных реестров.
        sockets: set[WebSocket] = set()
        for by_user in self._family_user_sockets.values():
            sockets.update(by_user.get(user_id, set()))
        for by_user in self._presence_connections.values():
            sockets.update(by_user.get(user_id, set()))
        sockets.update(self._user_connections.get(user_id, set()))

        payload = json.dumps({"type": "force_logout"}, ensure_ascii=False)
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception:  # noqa: BLE001
                pass
            try:
                await ws.close(code=4003)
            except Exception:  # noqa: BLE001
                pass
            # Чистим из всех индексов.
            for conns in self._chat_connections.values():
                conns.discard(ws)
            for conns in self._family_connections.values():
                conns.discard(ws)
            self._remove_from_family_user_index(ws)

    async def disconnect_family_all(self, family_id: UUID) -> None:
        """Закрыть ВСЕ соединения семьи на всех инстансах (удаление семьи)."""
        if await self._publish({"kind": "family_close", "id": str(family_id)}):
            return
        await self._close_family_all(family_id)

    async def _close_family_all(self, family_id: UUID) -> None:
        by_user = self._family_user_sockets.get(family_id)
        sockets: list[WebSocket] = []
        if by_user:
            for user_sockets in by_user.values():
                sockets.extend(user_sockets)
        sockets.extend(self._family_connections.get(family_id, set()))

        for ws in set(sockets):
            try:
                await ws.close(code=4003)
            except Exception:  # noqa: BLE001
                pass
            for chat_id, conns in list(self._chat_connections.items()):
                conns.discard(ws)
                if not conns:
                    del self._chat_connections[chat_id]

        self._family_connections.pop(family_id, None)
        self._family_user_sockets.pop(family_id, None)
        self._presence_connections.pop(family_id, None)


ws_manager = ConnectionManager()
