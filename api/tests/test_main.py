import asyncio
import logging

from app.main import configure_logging, create_app, lifespan
from tests.helpers import make_client, make_container, make_settings


def test_main__configure_logging_silences_httpx() -> None:
    configure_logging()
    assert logging.getLogger("httpx").level == logging.WARNING


async def test_main__create_app_registers_health_route() -> None:
    async with make_client() as client:
        assert (await client.get("/api/health")).status_code == 200


def test_main__create_app_disables_docs() -> None:
    app = create_app(make_settings(), make_container())
    assert app.docs_url is None and app.openapi_url is None


async def test_main__lifespan_closes_container() -> None:
    container = make_container()
    app = create_app(container.settings, container)
    async with lifespan(app):
        assert not container.http.is_closed
    assert container.http.is_closed


async def test_main__lifespan_starts_and_stops_scheduler() -> None:
    container = make_container()
    app = create_app(container.settings, container)
    async with lifespan(app):
        assert container.scheduler.job_ids() == ["daily", "weekly"]
    await asyncio.sleep(0.05)
    assert not container.scheduler._scheduler.running


def test_main__module_level_app_is_available_for_uvicorn() -> None:
    from app.main import app

    assert app.title == "RAD Chat API"


async def test_main__add_security_middleware_adds_headers_and_no_cors() -> None:
    async with make_client() as client:
        response = await client.get('/api/health', headers={'Origin': 'http://evil.test'})
    assert response.headers['x-frame-options'] == 'DENY'
    assert 'access-control-allow-origin' not in response.headers
