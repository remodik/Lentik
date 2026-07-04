"""In-memory стор pending-интеракций (Phase 3).

Человек кликнул компонент → создаём запись с TTL и шлём событие боту. Бот
отвечает по interaction_id → запись потребляется. Если бот не ответил за TTL,
запись истекает (клиент сам снимает «загрузку» по своему таймауту).

Стор локальный для процесса — у одного инстанса этого достаточно. При нескольких
репликах нужен общий стор (Redis), т.к. интеракция могла создаться на одном
инстансе, а ответ бота прийти на другой — вне MVP.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from uuid import UUID

_TTL_SECONDS = 15.0
_MAX_ITEMS = 5000


@dataclass
class PendingInteraction:
    id: str
    message_id: UUID
    chat_id: UUID
    family_id: UUID
    bot_id: UUID
    user_id: UUID
    expires_at: float


class InteractionStore:
    def __init__(self) -> None:
        self._items: dict[str, PendingInteraction] = {}

    def create(
        self,
        *,
        message_id: UUID,
        chat_id: UUID,
        family_id: UUID,
        bot_id: UUID,
        user_id: UUID,
    ) -> str:
        self._sweep()
        iid = uuid.uuid4().hex
        self._items[iid] = PendingInteraction(
            id=iid,
            message_id=message_id,
            chat_id=chat_id,
            family_id=family_id,
            bot_id=bot_id,
            user_id=user_id,
            expires_at=time.monotonic() + _TTL_SECONDS,
        )
        return iid

    def consume(self, iid: str) -> PendingInteraction | None:
        """Достать и удалить запись. None — нет или истекла."""
        p = self._items.pop(iid, None)
        if p is None or p.expires_at < time.monotonic():
            return None
        return p

    def _sweep(self) -> None:
        if len(self._items) < _MAX_ITEMS:
            return
        now = time.monotonic()
        for k in [k for k, v in self._items.items() if v.expires_at < now]:
            self._items.pop(k, None)


interaction_store = InteractionStore()
