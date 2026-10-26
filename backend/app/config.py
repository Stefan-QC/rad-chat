"""Applicatie-instellingen die uit de omgeving worden geladen."""

from functools import lru_cache
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Alle configuratie van de API, gevuld vanuit omgevingsvariabelen."""

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore", case_sensitive=False)

    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_service_role_key: str = ""
    gif_provider: Literal["giphy", "klipy"] = "giphy"
    giphy_api_key: str = ""
    klipy_api_key: str = ""
    gif_rating: str = "pg-13"
    timezone: str = "Europe/Amsterdam"
    rate_limit_per_minute: int = Field(default=60, ge=1, le=100000)
    max_body_bytes: int = Field(default=65536, ge=1024, le=10_000_000)
    port: int = Field(default=8000, ge=1, le=65535)

    @field_validator("supabase_url")
    @classmethod
    def normalize_supabase_url(cls, value: str) -> str:
        """Verwijdert witruimte en een afsluitende slash van de URL."""
        return value.strip().rstrip("/")

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        """Controleert dat de tijdzone bestaat."""
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown timezone") from None
        return value

    @property
    def rest_url(self) -> str:
        """Basis-URL van de PostgREST API."""
        return f"{self.supabase_url}/rest/v1"

    @property
    def auth_url(self) -> str:
        """Basis-URL van de GoTrue API."""
        return f"{self.supabase_url}/auth/v1"


@lru_cache
def get_settings() -> Settings:
    """Geeft een gecachte Settings-instantie terug."""
    return Settings()
