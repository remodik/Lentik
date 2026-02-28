import json
from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._chat_connections: dict[UUID, set[WebSocket]] = defaultdict(set)
        self._family_connections: dict[UUID, set[WebSocket]] = defaultdict(set)

    async def connect(self, chat_id: UUID, ws: WebSocket) -> None:
        await ws.accept()
        self._chat_connections[chat_id].add(ws)

    def disconnect(self, chat_id: UUID, ws: WebSocket) -> None:
        self._chat_connections[chat_id].discard(ws)
        if not self._chat_connections[chat_id]:
            del self._chat_connections[chat_id]

    async def connect_family(self, family_id: UUID, ws: WebSocket) -> None:
        await ws.accept()
        self._family_connections[family_id].add(ws)

    def disconnect_family(self, family_id: UUID, ws: WebSocket) -> None:
        self._family_connections[family_id].discard(ws)
        if not self._family_connections[family_id]:
            del self._family_connections[family_id]

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