"""Beheer van de bewaartermijn van berichten."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.admin.audit_service import AuditService
from app.clients.supabase_rest import SupabaseRest
from app.security.models import CurrentUser

RETENTION_KEY = "message_retention_days"


class RetentionRequest(BaseModel):
    """Aantal dagen dat berichten bewaard blijven (0 is voor altijd)."""

    model_config = ConfigDict(extra="forbid")

    days: int = Field(ge=0, le=3650)


class RetentionResponse(BaseModel):
    """De huidige bewaartermijn."""

    days: int


class RetentionSettingsService:
    """Leest en schrijft de bewaartermijn in de tabel app_settings."""

    def __init__(self, rest: SupabaseRest, audit: AuditService) -> None:
        self._rest = rest
        self._audit = audit

    @staticmethod
    def _parse(rows: list[dict[str, Any]]) -> int:
        """Zet de opgeslagen tekst om naar dagen; ontbrekend of ongeldig betekent 0."""
        try:
            return max(0, min(3650, int(rows[0]["value"])))
        except (IndexError, KeyError, TypeError, ValueError):
            return 0

    async def get_days(self) -> RetentionResponse:
        """Geeft de huidige bewaartermijn terug."""
        rows = await self._rest.select(
            "app_settings", {"key": f"eq.{RETENTION_KEY}", "select": "value"}
        )
        return RetentionResponse(days=self._parse(rows))

    async def set_days(self, actor: CurrentUser, request: RetentionRequest) -> RetentionResponse:
        """Slaat de bewaartermijn op en legt dat vast."""
        await self._rest.upsert(
            "app_settings", {"key": RETENTION_KEY, "value": str(request.days)}, "key"
        )
        await self._audit.record(
            str(actor.id), "admin.retention", "setting", RETENTION_KEY, {"days": request.days}
        )
        return RetentionResponse(days=request.days)
