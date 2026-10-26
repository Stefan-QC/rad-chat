import pytest

from app.gifs.giphy_provider import GIPHY_BASE_URL
from tests.helpers import MEMBER_ID, make_client, make_container, mock_login
from tests.test_giphy_provider import payload


async def test_gifs__search_returns_results_for_member(mock_http) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member")
    mock_http.get(f"{GIPHY_BASE_URL}/search").respond(200, json=payload())
    async with make_client(make_container()) as client:
        response = await client.get("/api/gifs/search", params={"q": "cat"}, headers=headers)
    body = response.json()
    assert response.status_code == 200
    assert set(body["results"][0]) == {"id", "title", "preview_url", "url", "width", "height"}
    assert body["next"] == "1"


async def test_gifs__search_requires_authentication() -> None:
    async with make_client() as client:
        response = await client.get("/api/gifs/search", params={"q": "cat"})
    assert response.status_code == 401


async def test_gifs__search_rejects_deactivated_user(mock_http) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member", deactivated_at="2024-01-01T00:00:00Z")
    async with make_client() as client:
        response = await client.get("/api/gifs/search", params={"q": "cat"}, headers=headers)
    assert response.status_code == 403


@pytest.mark.parametrize(
    "params",
    [{}, {"q": ""}, {"q": "   "}, {"q": "x" * 81}, {"q": "a", "limit": 0}, {"q": "a", "limit": 51}, {"q": "a", "pos": "a b;"}],
)
async def test_gifs__search_validates_input(mock_http, params: dict) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member")
    async with make_client() as client:
        response = await client.get("/api/gifs/search", params=params, headers=headers)
    assert response.status_code == 422


async def test_gifs__search_rate_limits_per_user(mock_http) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member")
    mock_http.get(f"{GIPHY_BASE_URL}/search").respond(200, json=payload())
    async with make_client(make_container(rate_limit_per_minute=1)) as client:
        first = await client.get("/api/gifs/search", params={"q": "cat"}, headers=headers)
        second = await client.get("/api/gifs/search", params={"q": "cat"}, headers=headers)
    assert (first.status_code, second.status_code) == (200, 429)


async def test_gifs__search_maps_provider_failure_to_502(mock_http) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member")
    mock_http.get(f"{GIPHY_BASE_URL}/search").respond(500, text="secret upstream detail")
    async with make_client() as client:
        response = await client.get("/api/gifs/search", params={"q": "cat"}, headers=headers)
    assert response.status_code == 502
    assert "secret" not in response.text


async def test_gifs__search_filters_foreign_hosts(mock_http) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member")
    evil = payload()
    evil["data"][0]["images"]["downsized"]["url"] = "https://evil.example/x.gif"
    mock_http.get(f"{GIPHY_BASE_URL}/search").respond(200, json=evil)
    async with make_client() as client:
        response = await client.get("/api/gifs/search", params={"q": "cat"}, headers=headers)
    assert response.json()["results"] == []


async def test_gifs__trending_returns_results(mock_http) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "guest")
    mock_http.get(f"{GIPHY_BASE_URL}/trending").respond(200, json=payload())
    async with make_client() as client:
        response = await client.get("/api/gifs/trending", params={"limit": 5}, headers=headers)
    assert response.status_code == 200 and len(response.json()["results"]) == 1
