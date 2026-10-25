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
