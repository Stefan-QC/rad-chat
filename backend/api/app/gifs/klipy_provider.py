"""GIF-aanbieder voor KLIPY (parsing is best-effort tot dit met een echte sleutel is geverifieerd)."""

import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.gifs.gif_models import GifItem, GifPage
from app.gifs.gif_provider import GifProvider, to_int

KLIPY_BASE_URL = "https://api.klipy.com/api/v1"
SMALL_TOKENS = ("xs", "sm", "small", "tiny", "preview", "thumb", "thumbnail")
MEDIUM_TOKENS = ("md", "medium", "mid")
VIDEO_TOKENS = ("mp4", "webm", "mov", "video")
MAX_DEPTH = 5


@dataclass(frozen=True)
class FileCandidate:
    """Een mogelijke afbeelding uit het files-object van KLIPY."""

    tokens: frozenset[str]
    url: str
    width: int
    height: int


class KlipyProvider(GifProvider):
    """Praat met de KLIPY API; de cursor is een paginanummer."""

    name = "klipy"
    allowed_suffixes = ("klipy.com", "klipy.co")

    def __init__(self, http: httpx.AsyncClient, api_key: str, rating: str = "pg-13") -> None:
        super().__init__(http, api_key)
        self._rating = rating

    @staticmethod
    def _page_number(pos: str | None) -> int:
        """Zet de cursor om naar een paginanummer van minimaal 1."""
        return max(1, to_int(pos)) if pos else 1

    def _endpoint(self, kind: str) -> str:
        """Bouwt de URL met de API-sleutel in het pad."""
        return f"{KLIPY_BASE_URL}/{self._api_key}/gifs/{kind}"

    def _params(self, limit: int, page: int, query: str | None) -> dict[str, Any]:
        """Bouwt de queryparameters; per_page ligt tussen 8 en 50."""
        params: dict[str, Any] = {
            "per_page": min(50, max(8, limit)),
            "page": page,
            "rating": self._rating,
        }
        if query is not None:
            params["q"] = query
        return params

    @staticmethod
    def _tokens(path: tuple[str, ...]) -> frozenset[str]:
        """Splitst een pad van sleutels in kleine letters."""
        parts = re.split(r"[^a-z0-9]+", " ".join(path).lower())
        return frozenset(part for part in parts if part)

    def _collect(self, node: Any, path: tuple[str, ...], found: list[FileCandidate], depth: int = 0) -> None:
        """Zoekt recursief naar objecten of teksten met een URL."""
        if depth > MAX_DEPTH:
            return
        if isinstance(node, str):
            if node.startswith("http"):
                found.append(FileCandidate(self._tokens(path), node, 0, 0))
            return
        if isinstance(node, list):
            for child in node:
                self._collect(child, path, found, depth + 1)
            return
        if not isinstance(node, dict):
            return
        if isinstance(node.get("url"), str):
            found.append(
                FileCandidate(
                    self._tokens(path),
                    node["url"],
                    to_int(node.get("width")),
                    to_int(node.get("height")),
                )
            )
        for key, child in node.items():
            if key in ("url", "width", "height"):
                continue
            self._collect(child, path + (str(key),), found, depth + 1)

    @staticmethod
    def _pick(candidates: list[FileCandidate], wanted: tuple[str, ...], smallest: bool) -> FileCandidate | None:
        """Kiest een afbeelding op sleutelwoorden, met de grootte als terugval."""
        images = [c for c in candidates if not c.tokens.intersection(VIDEO_TOKENS)] or candidates
        if not images:
            return None
        matches = [c for c in images if c.tokens.intersection(wanted)]
        if matches:
            return next((c for c in matches if "gif" in c.tokens), matches[0])
        sized = sorted((c for c in images if c.width), key=lambda c: c.width)
        if sized:
            return sized[0] if smallest else sized[-1]
        return images[0] if smallest else images[-1]

    def _parse_item(self, raw: Any) -> GifItem | None:
        """Zet één KLIPY-item defensief om, of None als het onbruikbaar is."""
        if not isinstance(raw, dict):
            return None
        identifier = raw.get("id") or raw.get("slug")
        found: list[FileCandidate] = []
        self._collect(raw.get("files"), (), found)
        preview = self._pick(found, SMALL_TOKENS, smallest=True)
        if not identifier or preview is None:
            return None
        full = self._pick(found, MEDIUM_TOKENS, smallest=False) or preview
        return GifItem(
            id=str(identifier),
            title=str(raw.get("title") or "")[:200],
            preview_url=preview.url,
            url=full.url,
            width=full.width,
            height=full.height,
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
