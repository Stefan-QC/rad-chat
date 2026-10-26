"""Gebruikersmodellen voor authenticatie en autorisatie."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel


class Role(StrEnum):
    """De rollen die een gebruiker kan hebben."""

    MEMBER = "member"
    GUEST = "guest"
    ADMIN = "admin"


class CurrentUser(BaseModel):
    """De ingelogde gebruiker zoals die uit het profiel is geladen."""

    id: UUID
    username: str | None = None
    display_name: str | None = None
    role: Role
    expires_at: datetime | None = None
    deactivated_at: datetime | None = None

    @property
    def is_admin(self) -> bool:
        """Geeft aan of de gebruiker beheerder is."""
        return self.role == Role.ADMIN
