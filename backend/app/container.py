"""Bouwt alle clients en services op en houdt ze bij elkaar."""

import httpx

from app.admin.audit_service import AuditService
from app.admin.export_service import ExportService
from app.admin.retention_service import RetentionSettingsService
from app.admin.user_service import UserAdminService
from app.clients.http import build_http_client
from app.clients.supabase_auth_admin import SupabaseAuthAdmin
from app.clients.supabase_rest import SupabaseRest
from app.clients.supabase_storage import SupabaseStorage
from app.config import Settings
from app.gifs.gif_factory import GifProviderFactory
from app.gifs.gif_service import GifService
from app.jobs.job_runner import JobRunner
from app.jobs.job_scheduler import JobScheduler
from app.security.job_auth import JobAuthenticator
from app.security.rate_limiter import RateLimiter
from app.security.token_verifier import SupabaseTokenVerifier
from app.ai_chat.model import generate_reply


class Container:
    """Dependency-container die per applicatie één keer wordt aangemaakt."""

    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.http = http or build_http_client()
        self.rest = SupabaseRest(settings, self.http)
        self.auth_admin = SupabaseAuthAdmin(settings, self.http)
        self.storage = SupabaseStorage(settings, self.http)
        self.verifier = SupabaseTokenVerifier(settings, self.http, self.rest)
        self.rate_limiter = RateLimiter(settings.rate_limit_per_minute)
        self.audit = AuditService(self.rest)
        self.user_admin = UserAdminService(self.auth_admin, self.rest, self.audit)
        self.export_service = ExportService(self.rest, self.audit)
        self.retention_service = RetentionSettingsService(self.rest, self.audit)
        self.job_runner = JobRunner(self.rest, self.audit, self.storage)
        self.job_auth = JobAuthenticator(self.verifier, self.rate_limiter)
        self.scheduler = JobScheduler(self.job_runner, settings.timezone)
        self.gif_service = GifService(GifProviderFactory.create(settings, self.http))
        self.generate_reply = generate_reply

    async def aclose(self) -> None:
        """Sluit de gedeelde HTTP-client."""
        await self.http.aclose()
