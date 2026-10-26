import httpx
import pytest

from app.errors import ApiError
from app.gifs.gif_models import GifPage
from app.gifs.gif_provider import GifProvider, to_int

URL = "https://api.example.test/x"


class DummyProvider(GifProvider):
    name = "dummy"
    allowed_suffixes = ("good.com",)

    async def search(self, query, limit, pos):
        return await super().search(query, limit, pos)

    async def trending(self, limit, pos):
        return await super().trending(limit, pos)


def make_provider(key: str = "k") -> DummyProvider:
    return DummyProvider(httpx.AsyncClient(), key)


def test_gif_provider__to_int_handles_strings_and_garbage() -> None:
    assert to_int("42") == 42
    assert to_int(None) == 0
    assert to_int("abc") == 0
    assert to_int(-5) == 0


@pytest.mark.parametrize(
    "url",
    ["https://good.com/a.gif", "https://media.good.com/a.gif", "https://MEDIA.GOOD.COM/a.gif"],
)
def test_gif_provider__is_allowed_url_accepts_allowlisted_https(url: str) -> None:
    assert make_provider().is_allowed_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "http://good.com/a.gif",
        "https://evil.com/a.gif",
        "https://notgood.com/a.gif",
        "https://good.com.evil.com/a.gif",
        "https://user:pw@good.com/a.gif",
        "javascript:alert(1)",
        "data:image/gif;base64,AAAA",
        "//good.com/a.gif",
        "",
    ],
)
def test_gif_provider__is_allowed_url_rejects_unsafe(url: str) -> None:
    assert not make_provider().is_allowed_url(url)


async def test_gif_provider__search_abstract_body_returns_none() -> None:
    assert await make_provider().search("q", 1, None) is None


async def test_gif_provider__trending_abstract_body_returns_none() -> None:
    assert await make_provider().trending(1, None) is None


def test_gif_provider__require_key_raises_when_missing() -> None:
    with pytest.raises(ApiError) as info:
        make_provider("")._require_key()
    assert info.value.status_code == 503


async def test_gif_provider__get_json_returns_payload(mock_http) -> None:
    mock_http.get(URL).respond(200, json={"a": 1})
    assert await make_provider()._get_json(URL, {}) == {"a": 1}


@pytest.mark.parametrize("status, expected", [(429, 429), (500, 502), (403, 502)])
async def test_gif_provider__get_json_maps_status(mock_http, status: int, expected: int) -> None:
    mock_http.get(URL).respond(status)
    with pytest.raises(ApiError) as info:
        await make_provider()._get_json(URL, {})
    assert info.value.status_code == expected


async def test_gif_provider__get_json_maps_timeout_to_502(mock_http) -> None:
    mock_http.get(URL).mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(ApiError) as info:
        await make_provider()._get_json(URL, {})
    assert info.value.status_code == 502


async def test_gif_provider__get_json_maps_connection_error_to_502(mock_http) -> None:
    mock_http.get(URL).mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(ApiError):
        await make_provider()._get_json(URL, {})


async def test_gif_provider__get_json_rejects_non_json(mock_http) -> None:
    mock_http.get(URL).respond(200, content=b"<html>")
    with pytest.raises(ApiError):
        await make_provider()._get_json(URL, {})


async def test_gif_provider__get_json_rejects_non_object(mock_http) -> None:
    mock_http.get(URL).respond(200, json=[1, 2])
    with pytest.raises(ApiError):
        await make_provider()._get_json(URL, {})


def test_gif_provider__page_model_is_importable() -> None:
    assert GifPage(results=[]).next is None
