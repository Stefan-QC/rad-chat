"""Client voor de GoTrue admin API van Supabase."""

from typing import Any

from app.clients.supabase_base import SupabaseClientBase
from app.errors import ApiError


class SupabaseAuthAdmin(SupabaseClientBase):
    """Beheert gebruikers via de admin-endpoints van GoTrue."""

    def _check_user_response(self, response: Any) -> None:
        """Vertaalt bekende GoTrue-fouten naar passende ApiErrors."""
        if response.status_code == 404:
            raise ApiError(404, "User not found")
        if response.status_code in (409, 422) and self._is_duplicate(response):
            raise ApiError(409, "A user with this email already exists")
        if response.status_code in (400, 422):
            raise ApiError(400, "The user data was rejected")
        self._check(response)

    @staticmethod
    def _is_duplicate(response: Any) -> bool:
        """Herkent een 'e-mail bestaat al' antwoord van GoTrue."""
        try:
            payload = response.json()
        except ValueError:
            return False
        text = f"{payload.get('error_code', '')} {payload.get('msg', '')}".lower()
        return "email_exists" in text or "already" in text

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

    async def get_user(self, user_id: str) -> dict[str, Any]:
        """Haalt één gebruiker op."""
        response = await self._send(
            "GET",
            f"{self._settings.auth_url}/admin/users/{user_id}",
            headers=self._service_headers(),
        )
        self._check_user_response(response)
        return response.json()

    async def create_user(
        self, email: str, password: str, display_name: str | None
    ) -> dict[str, Any]:
        """Maakt een bevestigde gebruiker aan."""
        body = {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"display_name": display_name},
        }
        response = await self._send(
            "POST",
            f"{self._settings.auth_url}/admin/users",
            json=body,
            headers=self._service_headers(),
        )
        self._check_user_response(response)
        return response.json()

    async def invite(self, email: str, role: str | None) -> dict[str, Any]:
        """Stuurt een uitnodiging per e-mail."""
        body: dict[str, Any] = {"email": email}
        if role:
            body["data"] = {"role": role}
        response = await self._send(
            "POST",
            f"{self._settings.auth_url}/invite",
            json=body,
            headers=self._service_headers(),
        )
        self._check_user_response(response)
        return response.json()

    async def update_user(self, user_id: str, attributes: dict[str, Any]) -> dict[str, Any]:
        """Wijzigt attributen zoals wachtwoord of ban_duration."""
        response = await self._send(
            "PUT",
            f"{self._settings.auth_url}/admin/users/{user_id}",
            json=attributes,
            headers=self._service_headers(),
        )
        self._check_user_response(response)
        return response.json()
