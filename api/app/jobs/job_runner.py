"""Voert onderhoudstaken uit via Postgres-functies."""

from typing import Any, Literal

from app.admin.audit_service import AuditService
from app.clients.supabase_rest import SupabaseRest

JobName = Literal["expire_guests", "purge_messages", "post_celebrations", "run_coffee_round"]
JOB_NAMES: tuple[str, ...] = ("expire_guests", "purge_messages", "post_celebrations", "run_coffee_round")


class JobRunner:
    """Roept de Postgres-functie van een taak aan en legt dat vast in het audit-log."""

    def __init__(self, rest: SupabaseRest, audit: AuditService) -> None:
        self._rest = rest
        self._audit = audit

    @staticmethod
    def _summary(result: Any) -> dict[str, Any]:
        """Zorgt dat het resultaat altijd een JSON-object is."""
        return result if isinstance(result, dict) else {"result": result}

    async def run(self, name: JobName, actor_id: str | None, via: str) -> dict[str, Any]:
        """Voert de taak uit en geeft de samenvatting van de database terug."""
        summary = self._summary(await self._rest.rpc(f"jobs_{name}", {}))
        await self._audit.record(
            actor_id, f"admin.job.{name}", "job", name, {"via": via, "summary": summary}
        )
        return summary
