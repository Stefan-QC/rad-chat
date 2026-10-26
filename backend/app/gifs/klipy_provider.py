"""GIF-aanbieder voor KLIPY, gebouwd op de officiële datamodellen van de KLIPY-voorbeeldapp."""

from typing import Any

from app.gifs.gif_models import GifItem, GifPage
from app.gifs.gif_provider import GifProvider, to_int

KLIPY_BASE_URL = "https://api.klipy.com/api/v1"
# Een vaste, anonieme waarde: KLIPY vraagt om een gebruikers-id, maar wij sturen geen persoonsgegevens mee.
CUSTOMER_ID = "rad-chat"
# De volgorde waarin een formaat wordt gekozen: klein voor het voorbeeld, middelgroot voor het bericht.
PREVIEW_SIZES = ("xs", "sm", "md", "hd")
FULL_SIZES = ("md", "sm", "hd", "xs")


class KlipyProvider(GifProvider):
    """Praat met de KLIPY API; de cursor is een paginanummer."""

    name = "klipy"
    allowed_suffixes = ("klipy.com", "klipy.co")

    @staticmethod
    def _page_number(pos: str | None) -> int:
        """Zet de cursor om naar een paginanummer van minimaal 1."""
        return max(1, to_int(pos)) if pos else 1

    def _endpoint(self, kind: str) -> str:
        """Bouwt de URL met de API-sleutel in het pad."""
        return f"{KLIPY_BASE_URL}/{self._api_key}/gifs/{kind}"

    @staticmethod
    def _params(limit: int, page: int, query: str | None) -> dict[str, Any]:
        """Bouwt de queryparameters; per_page ligt tussen 8 en 50."""
        params: dict[str, Any] = {"per_page": min(50, max(8, limit)), "page": page, "customer_id": CUSTOMER_ID}
        if query is not None:
            params["q"] = query
        return params

    @staticmethod
    def _gif_file(files: Any, sizes: tuple[str, ...]) -> tuple[str, int, int] | None:
        """Zoekt in de gewenste volgorde het eerste formaat met een gif en geeft (url, breedte, hoogte)."""
        if not isinstance(files, dict):
            return None
        for size in sizes:
            gif = files.get(size, {}).get("gif") if isinstance(files.get(size), dict) else None
            if isinstance(gif, dict) and isinstance(gif.get("url"), str):
                return gif["url"], to_int(gif.get("width")), to_int(gif.get("height"))
        return None

    def _parse_item(self, raw: Any) -> GifItem | None:
        """Zet één KLIPY-item om, of None voor advertenties en onbruikbare items."""
        if not isinstance(raw, dict) or raw.get("type") == "ad":
            return None
        identifier = raw.get("slug") or raw.get("id")
        preview = self._gif_file(raw.get("file"), PREVIEW_SIZES)
        full = self._gif_file(raw.get("file"), FULL_SIZES)
        if not identifier or preview is None or full is None:
            return None
        return GifItem(
            id=str(identifier),
            title=str(raw.get("title") or "")[:200],
            preview_url=preview[0],
            url=full[0],
            width=full[1],
            height=full[2],
        )

    def _parse_page(self, payload: dict[str, Any], page: int, limit: int) -> GifPage:
        """Zet het KLIPY-antwoord om naar een GifPage."""
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        raw_items = data.get("data") if isinstance(data.get("data"), list) else []
        items = [self._parse_item(raw) for raw in raw_items]
        results = [item for item in items if item is not None][:limit]
        return GifPage(results=results, next=str(page + 1) if data.get("has_next") else None)

    async def search(self, query: str, limit: int, pos: str | None) -> GifPage:
        page = self._page_number(pos)
        payload = await self._get_json(self._endpoint("search"), self._params(limit, page, query))
        return self._parse_page(payload, page, limit)

    async def trending(self, limit: int, pos: str | None) -> GifPage:
        page = self._page_number(pos)
        payload = await self._get_json(self._endpoint("trending"), self._params(limit, page, None))
        return self._parse_page(payload, page, limit)
