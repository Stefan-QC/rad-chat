"""Abstracte basis voor GIF-aanbieders."""

import logging
from abc import ABC, abstractmethod
from typing import Any
from urllib.parse import urlparse

import httpx

from app.errors import ApiError
from app.gifs.gif_models import GifPage

logger = logging.getLogger("app.gifs")


def to_int(value: Any) -> int:
    """Zet een getal of tekst veilig om naar een niet-negatief geheel getal."""
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


class GifProvider(ABC):
    """Haalt GIF's op bij een externe dienst en kent de toegestane hosts."""

    name: str = ""
    allowed_suffixes: tuple[str, ...] = ()

    def __init__(self, http: httpx.AsyncClient, api_key: str) -> None:
        self._http = http
        self._api_key = api_key

    @abstractmethod
    async def search(self, query: str, limit: int, pos: str | None) -> GifPage:
        """Zoekt GIF's op trefwoord."""

    @abstractmethod
    async def trending(self, limit: int, pos: str | None) -> GifPage:
        """Haalt populaire GIF's op."""

    def is_allowed_url(self, url: str) -> bool:
        """Staat alleen https-URL's van toegestane hosts toe."""
        try:
            parsed = urlparse(url)
            host = (parsed.hostname or "").lower()
        except ValueError:
            return False
        if parsed.scheme != "https" or parsed.username or parsed.password:
            return False
        return any(host == s or host.endswith(f".{s}") for s in self.allowed_suffixes)

    def _require_key(self) -> None:
        """Weigert verzoeken als er geen API-sleutel is ingesteld."""
        if not self._api_key:
            raise ApiError(503, "GIF provider is not configured")

    async def _get_json(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        """Haalt JSON op en vertaalt fouten naar een generieke 429 of 502."""
        self._require_key()
        try:
            response = await self._http.get(url, params=params)
        except httpx.TimeoutException:
            logger.warning("GIF provider %s timed out", self.name)
            raise ApiError(502, "GIF provider unavailable") from None
        except httpx.HTTPError:
            logger.warning("GIF provider %s request failed", self.name)
            raise ApiError(502, "GIF provider unavailable") from None
        if response.status_code == 429:
            raise ApiError(429, "GIF provider rate limit reached")
        if response.status_code >= 400:
            logger.warning("GIF provider %s returned %s", self.name, response.status_code)
            raise ApiError(502, "GIF provider unavailable")
        try:
            payload = response.json()
        except ValueError:
            raise ApiError(502, "GIF provider unavailable") from None
        if not isinstance(payload, dict):
            raise ApiError(502, "GIF provider unavailable")
        return payload
