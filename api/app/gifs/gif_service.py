"""GIF-service met cache en filtering op toegestane hosts."""

from collections.abc import Awaitable, Callable

from app.cache import TtlCache
from app.gifs.gif_models import GifPage
from app.gifs.gif_provider import GifProvider

CACHE_TTL_SECONDS = 300


class GifService:
    """Zoekt GIF's via de aanbieder en geeft alleen veilige URL's terug."""

    def __init__(self, provider: GifProvider, cache: TtlCache | None = None) -> None:
        self._provider = provider
        self._cache = cache or TtlCache(CACHE_TTL_SECONDS)

    async def search(self, query: str, limit: int, pos: str | None) -> GifPage:
        """Zoekt GIF's en gebruikt de cache als het resultaat er al is."""
        query = query.strip()
        key = f"{self._provider.name}|search|{query}|{limit}|{pos or ''}"
        return await self._cached(key, lambda: self._provider.search(query, limit, pos))

    async def trending(self, limit: int, pos: str | None) -> GifPage:
        """Haalt populaire GIF's op, met cache."""
        key = f"{self._provider.name}|trending||{limit}|{pos or ''}"
        return await self._cached(key, lambda: self._provider.trending(limit, pos))

    async def _cached(self, key: str, load: Callable[[], Awaitable[GifPage]]) -> GifPage:
        """Geeft een gecachte pagina terug of laadt en filtert die."""
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        page = self._filter(await load())
        self._cache.set(key, page)
        return page

    def _filter(self, page: GifPage) -> GifPage:
        """Verwijdert items waarvan een URL niet https of niet toegestaan is."""
        allowed = [
            item
            for item in page.results
            if self._provider.is_allowed_url(item.url) and self._provider.is_allowed_url(item.preview_url)
        ]
        return GifPage(results=allowed, next=page.next)
