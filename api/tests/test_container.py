from tests.helpers import make_container


async def test_container__aclose_closes_http_client() -> None:
    container = make_container()
    await container.aclose()
    assert container.http.is_closed
