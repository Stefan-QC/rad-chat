"""GIF-aanbieder voor Giphy."""

from typing import Any

import httpx

from app.gifs.gif_models import GifItem, GifPage
from app.gifs.gif_provider import GifProvider, to_int

GIPHY_BASE_URL = "https://api.giphy.com/v1/gifs"


class GiphyProvider(GifProvider):
    """Praat met de Giphy API; de cursor is een offset."""

    name = "giphy"
    allowed_suffixes = ("giphy.com",)

    def __init__(self, http: httpx.AsyncClient, api_key: str, rating: str = "pg-13") -> None:
        super().__init__(http, api_key)
        self._rating = rating

    @staticmethod
    def _offset(pos: str | None) -> int:
        """Zet de cursor om naar een offset, bij ongeldige invoer 0."""
        return to_int(pos) if pos else 0

    def _params(self, limit: int, offset: int, query: str | None) -> dict[str, Any]:
        """Bouwt de queryparameters voor Giphy."""
        params: dict[str, Any] = {
            "api_key": self._api_key,
            "limit": limit,
            "offset": offset,
            "rating": self._rating,
            "lang": "en",
        }
        if query is not None:
            params["q"] = query
        return params

    @staticmethod
    def _pick_image(images: dict[str, Any], names: tuple[str, ...]) -> dict[str, Any] | None:
        """Kiest de eerste beschikbare afbeelding met een URL."""
        for name in names:
            image = images.get(name)
            if isinstance(image, dict) and isinstance(image.get("url"), str) and image["url"]:
                return image
        return None

    def _parse_item(self, raw: Any) -> GifItem | None:
        """Zet één Giphy-item om, of None als het onbruikbaar is."""
        if not isinstance(raw, dict) or not isinstance(raw.get("images"), dict):
            return None
        images = raw["images"]
        preview = self._pick_image(images, ("fixed_height_small", "fixed_height"))
        full = self._pick_image(images, ("downsized", "original"))
        if preview is None or full is None or not raw.get("id"):
            return None
        return GifItem(
            id=str(raw["id"]),
            title=str(raw.get("title") or "")[:200],
            preview_url=preview["url"],
            url=full["url"],
            width=to_int(full.get("width")),
            height=to_int(full.get("height")),
        )

    def _parse_page(self, payload: dict[str, Any], offset: int) -> GifPage:
        """Zet het Giphy-antwoord om naar een GifPage."""
        items = [self._parse_item(raw) for raw in payload.get("data") or []]
        pagination = payload.get("pagination") or {}
        following = to_int(pagination.get("offset", offset)) + to_int(pagination.get("count"))
        has_more = following < to_int(pagination.get("total_count"))
        return GifPage(
            results=[item for item in items if item is not None],
            next=str(following) if has_more else None,
        )

    async def search(self, query: str, limit: int, pos: str | None) -> GifPage:
        offset = self._offset(pos)
        payload = await self._get_json(f"{GIPHY_BASE_URL}/search", self._params(limit, offset, query))
        return self._parse_page(payload, offset)

    async def trending(self, limit: int, pos: str | None) -> GifPage:
        offset = self._offset(pos)
        payload = await self._get_json(f"{GIPHY_BASE_URL}/trending", self._params(limit, offset, None))
        return self._parse_page(payload, offset)
