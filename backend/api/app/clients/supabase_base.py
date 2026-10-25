"""Gedeelde basis voor clients die met de service-role sleutel naar Supabase praten."""

import logging
from typing import Any

import httpx

from app.config import Settings
from app.errors import ApiError

logger = logging.getLogger("app.clients")


class SupabaseClientBase:
    """Verstuurt verzoeken met timeouts en vertaalt fouten naar generieke ApiErrors."""

    def __init__(self, settings: Settings, http: httpx.AsyncClient) -> None:
        self._settings = settings
        self._http = http

    def _service_headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        """Bouwt de headers met de service-role sleutel."""
        key = self._settings.supabase_service_role_key
        headers = {"apikey": key, "Authorization": f"Bearer {key}"}
        if extra:
            headers.update(extra)
        return headers

    async def _send(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        """Verstuurt een verzoek en vertaalt netwerkfouten naar een 502."""
        try:
            return await self._http.request(method, url, **kwargs)
        except httpx.TimeoutException:
            logger.warning("Upstream timeout for %s", method)
            raise ApiError(502, "Upstream service timed out") from None
        except httpx.HTTPError as exc:
            logger.warning("Upstream error of type %s", type(exc).__name__)
            raise ApiError(502, "Upstream service unavailable") from None

    def _check(self, response: httpx.Response, accepted: tuple[int, ...] = ()) -> None:
        """Gooit een generieke 502 bij een foutstatus zonder de body te loggen."""
        if response.status_code in accepted or response.status_code < 400:
            return
        logger.warning("Upstream returned status %s", response.status_code)
        raise ApiError(502, "Upstream service returned an error")
