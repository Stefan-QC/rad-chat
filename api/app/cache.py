"""Eenvoudige in-memory cache met een vaste levensduur per item."""

import time
from collections.abc import Callable
from typing import Any


class TtlCache:
    """Cache waarvan items na een aantal seconden verlopen."""

    def __init__(
        self,
        ttl_seconds: float,
        max_entries: int = 1024,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._clock = clock
        self._items: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        """Geeft de waarde terug of None als die ontbreekt of verlopen is."""
        entry = self._items.get(key)
        if entry is None:
            return None
        if entry[0] <= self._clock():
            del self._items[key]
            return None
        return entry[1]

    def set(self, key: str, value: Any) -> None:
        """Bewaart een waarde en ruimt zo nodig oude items op."""
        if key not in self._items and len(self._items) >= self._max_entries:
            self._purge_expired()
        if key not in self._items and len(self._items) >= self._max_entries:
            self._items.pop(next(iter(self._items)))
        self._items[key] = (self._clock() + self._ttl, value)

    def size(self) -> int:
        """Geeft het aantal bewaarde items terug."""
        return len(self._items)

    def _purge_expired(self) -> None:
        """Verwijdert alle verlopen items."""
        now = self._clock()
        self._items = {key: entry for key, entry in self._items.items() if entry[0] > now}
