import time
from asyncio import Lock
from collections import defaultdict, deque


class SlidingWindowLimiter:
    """In-memory sliding-window counter.

    Not consistent across multiple API workers — for that, swap the backend
    for Redis. This is a single-process defensive floor against
    unauthenticated brute-force.
    """

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def _trim(self, key: str, now: float) -> deque[float]:
        dq = self._events[key]
        while dq and dq[0] <= now - self.window:
            dq.popleft()
        if not dq and key in self._events:
            # keep dict small; recreate on next access via defaultdict
            del self._events[key]
            dq = self._events[key]
        return dq

    async def allow(self, key: str) -> bool:
        async with self._lock:
            now = time.monotonic()
            dq = self._trim(key, now)
            if len(dq) >= self.limit:
                return False
            dq.append(now)
            return True

    async def record(self, key: str) -> int:
        async with self._lock:
            now = time.monotonic()
            dq = self._trim(key, now)
            dq.append(now)
            return len(dq)

    async def count(self, key: str) -> int:
        async with self._lock:
            now = time.monotonic()
            dq = self._trim(key, now)
            return len(dq)

    async def reset(self, key: str) -> None:
        async with self._lock:
            self._events.pop(key, None)


# /auth/pin: max 5 неудач за 15 минут per-username, 20 — per-IP
pin_failure_limiter = SlidingWindowLimiter(limit=5, window_seconds=15 * 60)
pin_failure_ip_limiter = SlidingWindowLimiter(limit=20, window_seconds=15 * 60)

# /auth/check-username: max 30 запросов в минуту per-IP
check_username_limiter = SlidingWindowLimiter(limit=30, window_seconds=60)
