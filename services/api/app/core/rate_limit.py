import time
from asyncio import Lock
from collections import defaultdict, deque

from app.core import redis_client


class SlidingWindowLimiter:
    """Sliding-window counter.

    Если сконфигурирован Redis (`REDIS_URL`) — счётчик общий для всех инстансов
    и переживает рестарт (P3). Иначе — in-memory per-process защитный «пол»
    против неаутентифицированного перебора.
    """

    def __init__(self, limit: int, window_seconds: float, *, name: str) -> None:
        self.limit = limit
        self.window = window_seconds
        self.name = name
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    # ── Redis-бэкенд (sorted set как скользящее окно) ───────────────────────

    def _rkey(self, key: str) -> str:
        return f"rl:{self.name}:{key}"

    async def _redis_count(self, r, key: str) -> int:
        now = time.time()
        rk = self._rkey(key)
        await r.zremrangebyscore(rk, 0, now - self.window)
        return int(await r.zcard(rk))

    async def _redis_record(self, r, key: str) -> int:
        now = time.time()
        rk = self._rkey(key)
        pipe = r.pipeline()
        pipe.zremrangebyscore(rk, 0, now - self.window)
        # member уникален, чтобы одинаковые таймстемпы не схлопывались.
        pipe.zadd(rk, {f"{now}:{id(object())}": now})
        pipe.zcard(rk)
        pipe.expire(rk, int(self.window) + 1)
        res = await pipe.execute()
        return int(res[2])

    # ── Публичный интерфейс (не меняется для вызывающих) ────────────────────

    async def allow(self, key: str) -> bool:
        r = await redis_client.get_redis()
        if r is not None:
            count = await self._redis_count(r, key)
            if count >= self.limit:
                return False
            await self._redis_record(r, key)
            return True
        async with self._lock:
            now = time.monotonic()
            dq = self._trim(key, now)
            if len(dq) >= self.limit:
                return False
            dq.append(now)
            return True

    async def record(self, key: str) -> int:
        r = await redis_client.get_redis()
        if r is not None:
            return await self._redis_record(r, key)
        async with self._lock:
            now = time.monotonic()
            dq = self._trim(key, now)
            dq.append(now)
            return len(dq)

    async def count(self, key: str) -> int:
        r = await redis_client.get_redis()
        if r is not None:
            return await self._redis_count(r, key)
        async with self._lock:
            now = time.monotonic()
            dq = self._trim(key, now)
            return len(dq)

    async def reset(self, key: str) -> None:
        r = await redis_client.get_redis()
        if r is not None:
            await r.delete(self._rkey(key))
            return
        async with self._lock:
            self._events.pop(key, None)

    # ── In-memory helper ────────────────────────────────────────────────────

    def _trim(self, key: str, now: float) -> deque[float]:
        dq = self._events[key]
        while dq and dq[0] <= now - self.window:
            dq.popleft()
        if not dq and key in self._events:
            del self._events[key]
            dq = self._events[key]
        return dq


# /auth/pin: max 5 неудач за 15 минут per-username, 20 — per-IP
pin_failure_limiter = SlidingWindowLimiter(limit=5, window_seconds=15 * 60, name="pin_user")
pin_failure_ip_limiter = SlidingWindowLimiter(limit=20, window_seconds=15 * 60, name="pin_ip")

# /auth/check-username: max 30 запросов в минуту per-IP
check_username_limiter = SlidingWindowLimiter(limit=30, window_seconds=60, name="check_username")

# /auth/register: max 10 регистраций за час с одного IP
register_ip_limiter = SlidingWindowLimiter(limit=10, window_seconds=3600, name="register_ip")
