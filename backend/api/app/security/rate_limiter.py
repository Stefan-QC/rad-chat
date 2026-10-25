"""Rate limiting per gebruiker met een in-memory token bucket."""

import time
from collections.abc import Callable

from app.errors import ApiError


class TokenBucket:
    """Emmer die gevuld wordt met een vaste snelheid en tokens uitgeeft."""

    def __init__(self, capacity: float, refill_per_second: float, now: float) -> None:
        self.capacity = capacity
        self.refill_per_second = refill_per_second
        self.tokens = capacity
        self.updated_at = now

    def refill(self, now: float) -> None:
        """Vult de emmer aan op basis van de verstreken tijd."""
        elapsed = max(0.0, now - self.updated_at)
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_per_second)
        self.updated_at = now

    def take(self, now: float) -> bool:
        """Neemt één token als er nog een beschikbaar is."""
        self.refill(now)
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


class RateLimiter:
    """Houdt per sleutel (bijvoorbeeld een gebruikers-id) een token bucket bij."""

    MAX_BUCKETS = 10000

    def __init__(self, per_minute: int, clock: Callable[[], float] = time.monotonic) -> None:
        self._per_minute = per_minute
        self._clock = clock
        self._buckets: dict[str, TokenBucket] = {}

    def allow(self, key: str) -> bool:
        """Geeft aan of de sleutel nu nog een verzoek mag doen."""
        now = self._clock()
        bucket = self._buckets.get(key)
        if bucket is None:
            self._prune(now)
            bucket = TokenBucket(self._per_minute, self._per_minute / 60.0, now)
            self._buckets[key] = bucket
        return bucket.take(now)

    def check(self, key: str) -> None:
        """Gooit een 429 als de limiet is bereikt."""
        if not self.allow(key):
            raise ApiError(429, "Too many requests")

    def _prune(self, now: float) -> None:
        """Verwijdert volle (inactieve) emmers als er te veel zijn."""
        if len(self._buckets) < self.MAX_BUCKETS:
            return
        for key, bucket in list(self._buckets.items()):
            bucket.refill(now)
            if bucket.tokens >= bucket.capacity:
                del self._buckets[key]
        if len(self._buckets) >= self.MAX_BUCKETS:
            self._buckets.pop(next(iter(self._buckets)))
