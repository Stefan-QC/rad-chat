"""Client voor de GoTrue admin API van Supabase; alleen lezen."""

from typing import Any

from app.clients.supabase_base import SupabaseClientBase


class SupabaseAuthAdmin(SupabaseClientBase):
    """Leest gebruikers via GoTrue. Er zijn bewust geen functies om accounts te maken of te wijzigen."""

    async def list_users(self, page: int, per_page: int) -> list[dict[str, Any]]:
        """Haalt één pagina met gebruikers op."""
        response = await self._send(
            "GET",
            f"{self._settings.auth_url}/admin/users",
            params={"page": str(page), "per_page": str(per_page)},
            headers=self._service_headers(),
        )
        self._check(response)
        return response.json().get("users", [])
