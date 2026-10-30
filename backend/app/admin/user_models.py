"""Responsemodel voor de ledenlijst; accounts maak en wijzig je in Supabase, niet via deze API."""

from pydantic import BaseModel


class UserSummary(BaseModel):
    """Samenvatting van een gebruiker uit auth en profiel."""

    id: str
    email: str | None = None
    username: str | None = None
    display_name: str | None = None
    role: str | None = None
    expires_at: str | None = None
    deactivated_at: str | None = None
    last_sign_in_at: str | None = None
    created_at: str | None = None
