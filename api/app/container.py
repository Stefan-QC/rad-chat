"""Bouwt alle clients en services op en houdt ze bij elkaar."""

import httpx

from app.clients.http import build_http_client
from app.config import Settings


class Container:
    """Dependency-container die per applicatie één keer wordt aangemaakt."""

    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.http = http or build_http_client()

    async def aclose(self) -> None:
        """Sluit de gedeelde HTTP-client."""
        await self.http.aclose()
