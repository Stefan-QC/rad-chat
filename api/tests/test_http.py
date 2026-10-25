from app.clients.http import build_http_client


async def test_http__build_http_client_sets_timeout_and_no_redirects() -> None:
    client = build_http_client(7.0)
    try:
        assert client.timeout.read == 7.0
        assert client.timeout.connect == 5.0
        assert client.follow_redirects is False
    finally:
        await client.aclose()
