import secrets
import time
from asyncio import Lock
from uuid import UUID

TICKET_TTL_SECONDS = 60


class WsTicketStore:
    """One-shot, short-lived WebSocket auth tickets.

    Issued by an authenticated REST call, consumed once at WS handshake.
    Keeps the long-lived JWT out of URLs (logs, history, Referer).
    Single-process; for multi-instance use Redis.
    """

    def __init__(self) -> None:
        self._tickets: dict[str, tuple[UUID, float]] = {}
        self._lock = Lock()

    def _gc_locked(self, now: float) -> None:
        expired = [k for k, (_, exp) in self._tickets.items() if exp <= now]
        for k in expired:
            del self._tickets[k]

    async def issue(self, user_id: UUID) -> tuple[str, int]:
        async with self._lock:
            now = time.monotonic()
            self._gc_locked(now)
            ticket = secrets.token_urlsafe(32)
            self._tickets[ticket] = (user_id, now + TICKET_TTL_SECONDS)
            return ticket, TICKET_TTL_SECONDS

    async def consume(self, ticket: str) -> UUID | None:
        async with self._lock:
            now = time.monotonic()
            self._gc_locked(now)
            entry = self._tickets.pop(ticket, None)
            if not entry:
                return None
            user_id, expires_at = entry
            if expires_at <= now:
                return None
            return user_id


ws_ticket_store = WsTicketStore()
