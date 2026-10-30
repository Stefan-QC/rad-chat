"""Ledenlijst voor beheerders. Alleen lezen: accounts beheer je uitsluitend in Supabase."""

from typing import Any

from app.admin.user_models import UserSummary
from app.clients.supabase_auth_admin import SupabaseAuthAdmin
from app.clients.supabase_rest import SupabaseRest
from app.security.token_verifier import PROFILE_FIELDS


class UserAdminService:
    """Toont de gebruikers uit auth en profiel samengevoegd."""

    def __init__(self, auth_admin: SupabaseAuthAdmin, rest: SupabaseRest) -> None:
        self._auth = auth_admin
        self._rest = rest

    @staticmethod
    def _summary(auth_user: dict[str, Any], profile: dict[str, Any] | None) -> UserSummary:
        """Voegt de gegevens van auth en profiel samen."""
        profile = profile or {}
        return UserSummary(
            id=str(auth_user.get("id")),
            email=auth_user.get("email"),
            username=profile.get("username"),
            display_name=profile.get("display_name"),
            role=profile.get("role"),
            expires_at=profile.get("expires_at"),
            deactivated_at=profile.get("deactivated_at"),
            last_sign_in_at=auth_user.get("last_sign_in_at"),
            created_at=auth_user.get("created_at"),
        )

    async def _profiles_by_id(self, ids: list[str]) -> dict[str, dict[str, Any]]:
        """Laadt de profielen van de opgegeven gebruikers."""
        if not ids:
            return {}
        rows = await self._rest.select("profiles", {"id": f"in.({','.join(ids)})", "select": PROFILE_FIELDS})
        return {str(row["id"]): row for row in rows}

    async def list_users(self, page: int, per_page: int) -> list[UserSummary]:
        """Geeft één pagina met gebruikers inclusief profielgegevens."""
        users = await self._auth.list_users(page, per_page)
        profiles = await self._profiles_by_id([str(user["id"]) for user in users])
        return [self._summary(user, profiles.get(str(user["id"]))) for user in users]
