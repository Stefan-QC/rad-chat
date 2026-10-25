"""Client voor de PostgREST API van Supabase met de service-role sleutel."""

import re
from typing import Any

from app.clients.supabase_base import SupabaseClientBase
from app.errors import ApiError

_IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]{0,62}$")


class SupabaseRest(SupabaseClientBase):
    """Leest en schrijft tabellen en roept Postgres-functies aan."""

    @staticmethod
    def _identifier(name: str) -> str:
        """Controleert dat een tabel- of functienaam veilig is voor in een URL."""
        if not _IDENTIFIER.match(name):
            raise ValueError("Invalid identifier")
        return name

    def _table_url(self, table: str) -> str:
        """Bouwt de URL van een tabel."""
        return f"{self._settings.rest_url}/{self._identifier(table)}"

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        """Haalt rijen op met PostgREST-queryparameters."""
        response = await self._send(
            "GET", self._table_url(table), params=params, headers=self._service_headers()
        )
        self._check(response)
        return response.json()

    async def select_range(
        self, table: str, params: dict[str, str], start: int, end: int
    ) -> list[dict[str, Any]]:
        """Haalt een bereik van rijen op met de Range-header."""
        headers = self._service_headers({"Range-Unit": "items", "Range": f"{start}-{end}"})
        response = await self._send("GET", self._table_url(table), params=params, headers=headers)
        if response.status_code == 416:
            return []
        self._check(response)
        return response.json()

    async def insert(self, table: str, row: dict[str, Any]) -> None:
        """Voegt één rij toe zonder iets terug te vragen."""
        headers = self._service_headers({"Prefer": "return=minimal"})
        response = await self._send("POST", self._table_url(table), json=row, headers=headers)
        self._check(response)

    async def update(
        self, table: str, filters: dict[str, str], values: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Wijzigt rijen en geeft de gewijzigde rijen terug."""
        headers = self._service_headers({"Prefer": "return=representation"})
        response = await self._send(
            "PATCH", self._table_url(table), params=filters, json=values, headers=headers
        )
        self._check(response)
        return response.json()

    async def upsert(self, table: str, row: dict[str, Any], on_conflict: str) -> None:
        """Voegt een rij toe of overschrijft die op basis van een uniek veld."""
        headers = self._service_headers(
            {"Prefer": "resolution=merge-duplicates,return=minimal"}
        )
        response = await self._send(
            "POST",
            self._table_url(table),
            params={"on_conflict": on_conflict},
            json=row,
            headers=headers,
        )
        self._check(response)

    async def rpc(self, function: str, body: dict[str, Any] | None = None) -> Any:
        """Roept een Postgres-functie aan en geeft het JSON-resultaat terug."""
        url = f"{self._settings.rest_url}/rpc/{self._identifier(function)}"
        response = await self._send("POST", url, json=body or {}, headers=self._service_headers())
        self._check(response)
        if not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            raise ApiError(502, "Upstream service returned invalid data") from None
