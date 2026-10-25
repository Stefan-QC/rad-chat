"""Schrijft auditregels voor beheerdersacties."""

import logging
from typing import Any

from app.clients.supabase_rest import SupabaseRest
from app.errors import ApiError

logger = logging.getLogger("app.audit")
FORBIDDEN_KEY_PARTS = ("password", "token", "secret", "key")


class AuditService:
    """Legt vast wie welke beheerdersactie heeft uitgevoerd."""

    def __init__(self, rest: SupabaseRest) -> None:
        self._rest = rest

    @staticmethod
    def _sanitize(metadata: dict[str, Any] | None) -> dict[str, Any]:
        """Verwijdert velden die geheimen kunnen bevatten."""
        return {
            key: value
            for key, value in (metadata or {}).items()
            if not any(part in key.lower() for part in FORBIDDEN_KEY_PARTS)
        }

    async def record(
        self,
        actor_id: str | None,
        action: str,
        entity_type: str,
        entity_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Schrijft een auditregel; een mislukte audit stopt de actie niet maar wordt gelogd."""
        row = {
            "actor_id": actor_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "metadata": self._sanitize(metadata),
        }
        try:
            await self._rest.insert("audit_logs", row)
        except ApiError:
            logger.error("Audit log write failed for action %s", action)
