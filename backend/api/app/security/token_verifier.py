"""Verifieert Supabase access tokens en laadt het bijbehorende profiel."""

import hashlib
import re
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx

from app.cache import TtlCache
from app.clients.supabase_rest import SupabaseRest
from app.config import Settings
from app.errors import ApiError
from app.security.models import CurrentUser

_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9._~+/=-]{10,4096}$")
PROFILE_FIELDS = "id,username,display_name,role,expires_at,deactivated_at"


class SupabaseTokenVerifier:
    """Controleert een bearer token bij Supabase en het profiel in de database."""

    def __init__(
        self,
        settings: Settings,
        http: httpx.AsyncClient,
        rest: SupabaseRest,
        cache: TtlCache | None = None,
    ) -> None:
        self._settings = settings
        self._http = http
        self._rest = rest
        self._cache = cache or TtlCache(ttl_seconds=30)

    @staticmethod
    def hash_token(token: str) -> str:
        """Geeft de SHA-256 hash van een token, zodat het token zelf nooit bewaard wordt."""
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    async def verify(self, token: str) -> CurrentUser:
        """Valideert het token en geeft de actieve gebruiker terug."""
        if not _TOKEN_PATTERN.match(token):
            raise ApiError(401, "Invalid or expired token")
        key = self.hash_token(token)
        user_id = self._cache.get(key)
        if user_id is None:
            user_id = await self._authenticated_user_id(token)
            self._cache.set(key, user_id)
        profile = await self._load_profile(user_id)
        return self._build_user(profile)

    async def _authenticated_user_id(self, token: str) -> str:
        """Vraagt Supabase welke gebruiker bij het token hoort."""
        try:
            response = await self._http.get(
                f"{self._settings.auth_url}/user",
                headers={
                    "apikey": self._settings.supabase_publishable_key,
                    "Authorization": f"Bearer {token}",
                },
            )
        except httpx.HTTPError:
            raise ApiError(502, "Authentication service unavailable") from None
        if response.status_code in (401, 403):
            raise ApiError(401, "Invalid or expired token")
        if response.status_code != 200:
            raise ApiError(502, "Authentication service unavailable")
        try:
            return str(UUID(str(response.json().get("id"))))
        except (ValueError, AttributeError):
            raise ApiError(401, "Invalid or expired token") from None

    async def _load_profile(self, user_id: str) -> dict[str, Any]:
        """Laadt het profiel met de service-role sleutel."""
        rows = await self._rest.select(
            "profiles", {"id": f"eq.{user_id}", "select": PROFILE_FIELDS}
        )
        if not rows:
            raise ApiError(403, "No profile for this account")
        return rows[0]

    @staticmethod
    def _build_user(profile: dict[str, Any]) -> CurrentUser:
        """Bouwt de gebruiker en weigert gedeactiveerde of verlopen accounts."""
        try:
            user = CurrentUser.model_validate(profile)
        except ValueError:
            raise ApiError(403, "Account is not allowed") from None
        if user.deactivated_at is not None:
            raise ApiError(403, "Account is deactivated")
        if user.expires_at is not None:
            expires = user.expires_at
            if expires.tzinfo is None:
                expires = expires.replace(tzinfo=UTC)
            if expires <= datetime.now(UTC):
                raise ApiError(403, "Account has expired")
        return user
