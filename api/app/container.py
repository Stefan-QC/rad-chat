"""Bouwt alle clients en services op en houdt ze bij elkaar."""

import httpx

from app.clients.http import build_http_client
from app.clients.supabase_auth_admin import SupabaseAuthAdmin
from app.clients.supabase_rest import SupabaseRest
from app.config import Settings


class Container:
    """Dependency-container die per applicatie één keer wordt aangemaakt."""

    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.http = http or build_http_client()
        self.rest = SupabaseRest(settings, self.http)
        self.auth_admin = SupabaseAuthAdmin(settings, self.http)

    async def aclose(self) -> None:
        """Sluit de gedeelde HTTP-client."""
        await self.http.aclose()
