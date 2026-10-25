"""Voert onderhoudstaken uit via Postgres-functies."""

import logging
from typing import Any, Literal

from app.admin.audit_service import AuditService
from app.clients.supabase_rest import SupabaseRest
from app.clients.supabase_storage import SupabaseStorage
from app.errors import ApiError

logger = logging.getLogger("app.jobs")

JobName = Literal["expire_guests", "purge_messages", "post_celebrations", "run_coffee_round"]
JOB_NAMES: tuple[str, ...] = ("expire_guests", "purge_messages", "post_celebrations", "run_coffee_round")


class JobRunner:
    """Roept de Postgres-functie van een taak aan en legt dat vast in het audit-log."""

    def __init__(self, rest: SupabaseRest, audit: AuditService, storage: SupabaseStorage | None = None) -> None:
        self._rest = rest
        self._audit = audit
        self._storage = storage

    @staticmethod
    def _summary(result: Any) -> dict[str, Any]:
        """Zorgt dat het resultaat altijd een JSON-object is."""
        return result if isinstance(result, dict) else {"result": result}

    async def _cleanup_files(self, summary: dict[str, Any]) -> None:
        """Verwijdert de bestanden van weggegooide berichten en houdt de paden uit het audit-log."""
        paths = summary.pop("storage_paths", None)
        if not isinstance(paths, list):
            return
        if self._storage is None or not paths:
            summary["files_removed"] = 0
            return
        try:
            summary["files_removed"] = await self._storage.remove([str(path) for path in paths])
        except ApiError:
            logger.warning("Could not remove %s stored files", len(paths))
            summary["files_removed"] = 0
            summary["files_failed"] = len(paths)

    async def run(self, name: JobName, actor_id: str | None, via: str) -> dict[str, Any]:
        """Voert de taak uit en geeft de samenvatting van de database terug."""
        summary = self._summary(await self._rest.rpc(f"jobs_{name}", {}))
        if name == "purge_messages":
            await self._cleanup_files(summary)
        await self._audit.record(
            actor_id, f"admin.job.{name}", "job", name, {"via": via, "summary": summary}
        )
        return summary
