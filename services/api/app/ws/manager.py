import json
from collections import defaultdict
from uuid import UUID

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[UUID, set[WebSocket]] = defaultdict(set)

    async def connect(self, chat_id: UUID, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[chat_id].add(ws)

    def disconnect(self, chat_id: UUID, ws: WebSocket) -> None:
        self._connections[chat_id].discard(ws)
        if not self._connections[chat_id]:
            del self._connections[chat_id]

    async def broadcast_to_chat(self, chat_id: UUID, payload: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(chat_id, [])):
            try:
                await ws.send_text(json.dumps(payload, ensure_ascii=False))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(chat_id, ws)


ws_manager = ConnectionManager()