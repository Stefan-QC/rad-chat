"""Autorisatie voor job-endpoints: alleen admins."""

from starlette.requests import Request

from app.errors import ApiError
from app.security.bearer import extract_bearer
from app.security.rate_limiter import RateLimiter
from app.security.token_verifier import SupabaseTokenVerifier


class JobAuthenticator:
    """Laat een job alleen toe voor een ingelogde admin."""

    def __init__(self, verifier: SupabaseTokenVerifier, limiter: RateLimiter) -> None:
        self._verifier = verifier
        self._limiter = limiter

    async def authorize(self, request: Request) -> tuple[str, str]:
        """Geeft (actor_id, via) terug of gooit een 401/403."""
        user = await self._verifier.verify(extract_bearer(request))
        self._limiter.check(str(user.id))
        if not user.is_admin:
            raise ApiError(403, "Admin role required")
        return str(user.id), "admin"
