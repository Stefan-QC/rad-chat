"""Autorisatie voor job-endpoints: admin-token of gedeeld job-token."""

import hashlib
import hmac

from starlette.requests import Request

from app.config import Settings
from app.errors import ApiError
from app.security.bearer import extract_bearer
from app.security.rate_limiter import RateLimiter
from app.security.token_verifier import SupabaseTokenVerifier


class JobAuthenticator:
    """Laat een job toe voor een admin of voor een aanroeper met het juiste job-token."""

    def __init__(self, settings: Settings, verifier: SupabaseTokenVerifier, limiter: RateLimiter) -> None:
        self._settings = settings
        self._verifier = verifier
        self._limiter = limiter

    def token_matches(self, provided: str) -> bool:
        """Vergelijkt het token in constante tijd; uitgeschakeld bij een leeg JOB_TOKEN."""
        if not self._settings.job_token_enabled:
            return False
        expected = hashlib.sha256(self._settings.job_token.encode("utf-8")).digest()
        actual = hashlib.sha256(provided.encode("utf-8")).digest()
        return hmac.compare_digest(expected, actual)

    async def authorize(self, request: Request) -> tuple[str | None, str]:
        """Geeft (actor_id, via) terug of gooit een 401/403."""
        job_token = request.headers.get("x-job-token")
        if job_token is not None:
            if not self.token_matches(job_token):
                raise ApiError(401, "Invalid job token")
            self._limiter.check("job-token")
            return None, "job-token"
        user = await self._verifier.verify(extract_bearer(request))
        self._limiter.check(str(user.id))
        if not user.is_admin:
            raise ApiError(403, "Admin role required")
        return str(user.id), "admin"
