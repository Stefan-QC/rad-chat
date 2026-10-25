from app.cache import TtlCache


class FakeClock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def test_cache__get_returns_stored_value() -> None:
    cache = TtlCache(10)
    cache.set("a", 1)
    assert cache.get("a") == 1


def test_cache__get_returns_none_when_missing() -> None:
    assert TtlCache(10).get("missing") is None


def test_cache__get_expires_after_ttl() -> None:
    clock = FakeClock()
    cache = TtlCache(10, clock=clock)
    cache.set("a", 1)
    clock.now += 11
    assert cache.get("a") is None
    assert cache.size() == 0


def test_cache__set_evicts_oldest_when_full() -> None:
    cache = TtlCache(10, max_entries=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)
    assert cache.get("a") is None
    assert cache.get("c") == 3


def test_cache__set_overwrites_existing_key_when_full() -> None:
    cache = TtlCache(10, max_entries=1)
    cache.set("a", 1)
    cache.set("a", 2)
    assert cache.get("a") == 2


def test_cache__size_counts_items() -> None:
    cache = TtlCache(10)
    cache.set("a", 1)
    cache.set("b", 2)
    assert cache.size() == 2


def test_cache__purge_expired_removes_only_old_items() -> None:
    clock = FakeClock()
    cache = TtlCache(10, max_entries=2, clock=clock)
    cache.set("old", 1)
    clock.now += 11
    cache.set("new", 2)
    cache.set("newer", 3)
    assert cache.get("old") is None
    assert cache.get("new") == 2
    assert cache.get("newer") == 3
