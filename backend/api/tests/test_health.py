from tests.helpers import make_client


async def test_health__health_returns_ok_without_auth() -> None:
    async with make_client() as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
