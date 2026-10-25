"""Export van berichten naar JSON of CSV, met bescherming tegen formule-injectie."""

import csv
import io
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from app.admin.audit_service import AuditService
from app.clients.supabase_rest import SupabaseRest
from app.security.models import CurrentUser

ExportFormat = Literal["json", "csv"]
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
SELECT_FIELDS = (
    "id,created_at,body,deleted_at,parent_id,"
    "channel:channels(name),author:profiles(username,display_name)"
)
COLUMNS = ["id", "created_at", "channel", "author", "author_display_name", "body", "parent_id", "deleted_at"]


@dataclass
class ExportResult:
    """Het resultaat van een export: type, bestandsnaam en de datastroom."""

    media_type: str
    filename: str
    body: AsyncIterator[bytes]


class ExportService:
    """Leest berichten pagina voor pagina en levert ze als stroom."""

    PAGE_SIZE = 1000

    def __init__(self, rest: SupabaseRest, audit: AuditService) -> None:
        self._rest = rest
        self._audit = audit

    @staticmethod
    def csv_safe(value: Any) -> str:
        """Zet een waarde om naar tekst en voorkomt dat Excel er een formule van maakt."""
        if value is None:
            return ""
        text = str(value)
        if isinstance(value, str) and text.startswith(FORMULA_PREFIXES):
            return "'" + text
        return text

    @staticmethod
    def flatten(row: dict[str, Any]) -> dict[str, Any]:
        """Maakt van een bericht met geneste kanaal en auteur een platte rij."""
        channel = row.get("channel") or {}
        author = row.get("author") or {}
        return {
            "id": row.get("id"),
            "created_at": row.get("created_at"),
            "channel": channel.get("name"),
            "author": author.get("username"),
            "author_display_name": author.get("display_name"),
            "body": row.get("body"),
            "parent_id": row.get("parent_id"),
            "deleted_at": row.get("deleted_at"),
        }

    @classmethod
    def csv_line(cls, values: list[Any]) -> bytes:
        """Maakt één veilige CSV-regel."""
        buffer = io.StringIO()
        csv.writer(buffer, lineterminator="\r\n").writerow([cls.csv_safe(v) for v in values])
        return buffer.getvalue().encode("utf-8")

    @staticmethod
    def query_params(channel_id: UUID | None, since: datetime | None) -> dict[str, str]:
        """Bouwt de PostgREST-filters voor de export."""
        params = {"select": SELECT_FIELDS, "order": "id.asc"}
        if channel_id is not None:
            params["channel_id"] = f"eq.{channel_id}"
        if since is not None:
            params["created_at"] = f"gte.{since.isoformat()}"
        return params

    async def _pages(
        self, params: dict[str, str], first: list[dict[str, Any]]
    ) -> AsyncIterator[list[dict[str, Any]]]:
        """Geeft alle pagina's terug, beginnend met de reeds opgehaalde eerste."""
        page = first
        start = 0
        while page:
            yield page
            if len(page) < self.PAGE_SIZE:
                return
            start += self.PAGE_SIZE
            page = await self._rest.select_range("messages", params, start, start + self.PAGE_SIZE - 1)

    async def _csv_stream(self, params: dict[str, str], first: list[dict[str, Any]]) -> AsyncIterator[bytes]:
        """Stroomt het resultaat als CSV."""
        yield self.csv_line(COLUMNS)
        async for page in self._pages(params, first):
            for row in page:
                flat = self.flatten(row)
                yield self.csv_line([flat[column] for column in COLUMNS])

    async def _json_stream(self, params: dict[str, str], first: list[dict[str, Any]]) -> AsyncIterator[bytes]:
        """Stroomt het resultaat als een JSON-array."""
        yield b"["
        separator = b"\n"
        async for page in self._pages(params, first):
            for row in page:
                yield separator + json.dumps(self.flatten(row), ensure_ascii=False).encode("utf-8")
                separator = b",\n"
        yield b"\n]\n"

    async def export(
        self, actor: CurrentUser, channel_id: UUID | None, since: datetime | None, fmt: ExportFormat
    ) -> ExportResult:
        """Haalt de eerste pagina op, legt de export vast en geeft de stroom terug."""
        params = self.query_params(channel_id, since)
        first = await self._rest.select_range("messages", params, 0, self.PAGE_SIZE - 1)
        await self._audit.record(
            str(actor.id),
            "admin.export",
            "export",
            str(channel_id) if channel_id else None,
            {"channel_id": str(channel_id) if channel_id else None, "since": since.isoformat() if since else None, "format": fmt},
        )
        stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        stream = self._csv_stream(params, first) if fmt == "csv" else self._json_stream(params, first)
        media_type = "text/csv; charset=utf-8" if fmt == "csv" else "application/json"
        return ExportResult(media_type, f"messages-{stamp}.{fmt}", stream)
