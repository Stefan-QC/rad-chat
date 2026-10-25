"""Client voor Supabase Storage met de service-role sleutel, om geplakte afbeeldingen op te ruimen."""

import re

from app.clients.supabase_base import SupabaseClientBase

BUCKET = "chat-images"
CHUNK_SIZE = 100
_PATH = re.compile(r"^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|gif)$")


class SupabaseStorage(SupabaseClientBase):
    """Verwijdert bestanden uit de bucket met chatafbeeldingen."""

    @staticmethod
    def _valid(path: str) -> bool:
        """Staat alleen paden toe van de vorm kanaal/gebruiker/bestand, zodat er nooit iets anders verdwijnt."""
        return bool(_PATH.match(path))

    async def remove(self, paths: list[str]) -> int:
        """Verwijdert de bestanden in blokken en geeft terug hoeveel er echt weg zijn."""
        safe = [path for path in dict.fromkeys(paths) if self._valid(path)]
        removed = 0
        for start in range(0, len(safe), CHUNK_SIZE):
            response = await self._send(
                "DELETE",
                f"{self._settings.supabase_url}/storage/v1/object/{BUCKET}",
                json={"prefixes": safe[start : start + CHUNK_SIZE]},
                headers=self._service_headers(),
            )
            self._check(response)
            body = response.json()
            removed += len(body) if isinstance(body, list) else 0
        return removed
