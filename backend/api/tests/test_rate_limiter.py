import pytest

from app.errors import ApiError
from app.security.rate_limiter import RateLimiter, TokenBucket


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_rate_limiter__refill_token_bucket_caps_at_capacity() -> None:
    bucket = TokenBucket(5, 1.0, now=0.0)
    bucket.tokens = 0
    bucket.refill(100.0)
    assert bucket.tokens == 5


def test_rate_limiter__take_token_bucket_consumes_tokens() -> None:
    bucket = TokenBucket(2, 0.0, now=0.0)
    assert bucket.take(0.0) and bucket.take(0.0)
    assert bucket.take(0.0) is False


def test_rate_limiter__allow_blocks_after_limit_and_recovers() -> None:
    clock = FakeClock()
    limiter = RateLimiter(2, clock=clock)
    assert limiter.allow("u") and limiter.allow("u")
    assert limiter.allow("u") is False
    clock.now += 30
    assert limiter.allow("u") is True


def test_rate_limiter__allow_tracks_keys_separately() -> None:
    limiter = RateLimiter(1, clock=FakeClock())
    assert limiter.allow("a")
    assert limiter.allow("b")


def test_rate_limiter__check_raises_429_when_exhausted() -> None:
    limiter = RateLimiter(1, clock=FakeClock())
    limiter.check("u")
    with pytest.raises(ApiError) as info:
        limiter.check("u")
    assert info.value.status_code == 429


def test_rate_limiter__prune_drops_full_buckets_when_too_many() -> None:
    clock = FakeClock()
    limiter = RateLimiter(5, clock=clock)
    limiter.MAX_BUCKETS = 2
    limiter.allow("a")
    clock.now += 600
    limiter.allow("b")
    limiter.allow("c")
    assert "a" not in limiter._buckets


def test_rate_limiter__prune_evicts_oldest_when_all_active() -> None:
    limiter = RateLimiter(1, clock=FakeClock())
    limiter.MAX_BUCKETS = 2
    limiter.allow("a")
    limiter.allow("b")
    limiter.allow("c")
    assert len(limiter._buckets) == 2
    assert "a" not in limiter._buckets
