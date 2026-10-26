import httpx

from app.gifs.gif_models import GifItem, GifPage
from app.gifs.gif_provider import GifProvider
from app.gifs.gif_service import GifService


class FakeProvider(GifProvider):
    name = "fake"
    allowed_suffixes = ("good.com",)

    def __init__(self) -> None:
        super().__init__(httpx.AsyncClient(), "k")
        self.calls = 0

    def page(self) -> GifPage:
        return GifPage(
            results=[
                GifItem(id="1", preview_url="https://a.good.com/p.gif", url="https://a.good.com/f.gif"),
                GifItem(id="2", preview_url="https://a.good.com/p.gif", url="http://a.good.com/f.gif"),
                GifItem(id="3", preview_url="https://evil.com/p.gif", url="https://a.good.com/f.gif"),
            ],
            next="2",
        )

    async def search(self, query, limit, pos):
        self.calls += 1
        return self.page()

    async def trending(self, limit, pos):
        self.calls += 1
        return self.page()


async def test_gif_service__search_returns_cached_result() -> None:
    provider = FakeProvider()
    service = GifService(provider)
    first = await service.search("cat", 24, None)
    second = await service.search("cat", 24, None)
    assert first is second and provider.calls == 1


async def test_gif_service__search_cache_key_includes_query_limit_and_pos() -> None:
    provider = FakeProvider()
    service = GifService(provider)
    await service.search("cat", 24, None)
    await service.search("dog", 24, None)
    await service.search("cat", 10, None)
    await service.search("cat", 24, "5")
    assert provider.calls == 4


async def test_gif_service__search_strips_query() -> None:
    provider = FakeProvider()
    service = GifService(provider)
    await service.search(" cat ", 24, None)
    await service.search("cat", 24, None)
    assert provider.calls == 1


async def test_gif_service__trending_is_cached() -> None:
    provider = FakeProvider()
    service = GifService(provider)
    await service.trending(24, None)
    await service.trending(24, None)
    assert provider.calls == 1


async def test_gif_service__cached_loads_and_filters_once() -> None:
    service = GifService(FakeProvider())
    calls = []

    async def load() -> GifPage:
        calls.append(1)
        return FakeProvider().page()

    first = await service._cached("k", load)
    await service._cached("k", load)
    assert len(first.results) == 1 and len(calls) == 1


def test_gif_service__filter_drops_non_https_and_foreign_hosts() -> None:
    page = GifService(FakeProvider())._filter(FakeProvider().page())
    assert [item.id for item in page.results] == ["1"]
    assert page.next == "2"


def test_gif_service__filter_adds_the_provider_name_for_attribution() -> None:
    assert GifService(FakeProvider())._filter(FakeProvider().page()).provider == "fake"
