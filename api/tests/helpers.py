"""Hulpfuncties die door meerdere testmodules worden gedeeld."""

import httpx

from app.config import Settings
from app.container import Container
from app.main import create_app

SUPABASE_URL = "https://sb.test"
ADMIN_ID = "11111111-1111-1111-1111-111111111111"
MEMBER_ID = "22222222-2222-2222-2222-222222222222"
GUEST_ID = "33333333-3333-3333-3333-333333333333"


def make_settings(**overrides: object) -> Settings:
    """Maakt Settings zonder .env-bestand met testwaarden."""
    values: dict[str, object] = {
        "supabase_url": SUPABASE_URL,
        "supabase_publishable_key": "anon-key",
        "supabase_service_role_key": "service-key",
        "giphy_api_key": "giphy-key",
        "klipy_api_key": "klipy-key",
        "allowed_origins": "http://localhost:5173",
        "job_token": "job-secret",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def make_container(**overrides: object) -> Container:
    """Maakt een Container met testinstellingen."""
    return Container(make_settings(**overrides))


def make_client(container: Container | None = None) -> httpx.AsyncClient:
    """Maakt een testclient die direct tegen de ASGI-app praat."""
    container = container or make_container()
    app = create_app(container.settings, container)
    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")
