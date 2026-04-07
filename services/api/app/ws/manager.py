import json
from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._chat_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._family_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._presence_connections: dict[UUID, dict[UUID, set[WebSocket]]] = defaultdict(
            lambda: defaultdict(set)
        )
        self._user_connections: dict[UUID, set[WebSocket]] = defaultdict(set)

    async def connect(self, chat_id: UUID, ws: WebSocket) -> None:
        self._chat_connections[chat_id].add(ws)

    def disconnect(self, chat_id: UUID, ws: WebSocket) -> None:
        self._chat_connections[chat_id].discard(ws)
        if not self._chat_connections[chat_id]:
            del self._chat_connections[chat_id]

    async def connect_family(self, family_id: UUID, ws: WebSocket) -> None:
        self._family_connections[family_id].add(ws)

    def disconnect_family(self, family_id: UUID, ws: WebSocket) -> None:
        self._family_connections[family_id].discard(ws)
        if not self._family_connections[family_id]:
            del self._family_connections[family_id]

    def register_presence_connection(
        self,
        family_id: UUID,
        user_id: UUID,
        ws: WebSocket,
    ) -> bool:
        user_connections = self._presence_connections[family_id][user_id]
        user_connections.add(ws)

        global_connections = self._user_connections[user_id]
        was_offline = len(global_connections) == 0
        global_connections.add(ws)
        return was_offline

    def unregister_presence_connection(
        self,
        family_id: UUID,
        user_id: UUID,
        ws: WebSocket,
    ) -> bool:
        family_connections = self._presence_connections.get(family_id)
        if not family_connections:
            return False

        user_connections = family_connections.get(user_id)
        if not user_connections:
            return False

        user_connections.discard(ws)
        if user_connections:
            return False

        del family_connections[user_id]
        if not family_connections:
            del self._presence_connections[family_id]

        global_connections = self._user_connections.get(user_id)
        if not global_connections:
            return False

        global_connections.discard(ws)
        if global_connections:
            return False

        del self._user_connections[user_id]
        return True

    async def broadcast_to_chat(self, chat_id: UUID, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._chat_connections.get(chat_id, [])):
            try:
                await ws.send_text(json.dumps(payload, ensure_ascii=False))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(chat_id, ws)

    async def broadcast_to_family(self, family_id: UUID, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._family_connections.get(family_id, [])):
            try:
                await ws.send_text(json.dumps(payload, ensure_ascii=False))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_family(family_id, ws)


ws_manager = ConnectionManager()
