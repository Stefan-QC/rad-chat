import httpx
import pytest

from app.errors import ApiError
from app.gifs.giphy_provider import GIPHY_BASE_URL, GiphyProvider


def make_provider(key: str = "gk") -> GiphyProvider:
    return GiphyProvider(httpx.AsyncClient(), key, "pg-13")


def raw_item(**overrides) -> dict:
    item = {
        "id": "abc",
        "title": "Cat",
        "images": {
            "fixed_height_small": {"url": "https://media.giphy.com/s.gif"},
            "downsized": {"url": "https://media.giphy.com/d.gif", "width": "200", "height": "150"},
        },
    }
    item.update(overrides)
    return item


def payload(items=None, offset=0, count=1, total=10) -> dict:
    return {
        "data": items if items is not None else [raw_item()],
        "pagination": {"offset": offset, "count": count, "total_count": total},
    }


def test_giphy_provider__offset_parses_cursor() -> None:
    assert GiphyProvider._offset("24") == 24


def test_giphy_provider__offset_defaults_to_zero() -> None:
    assert GiphyProvider._offset(None) == 0
    assert GiphyProvider._offset("junk") == 0


def test_giphy_provider__params_include_rating_and_query() -> None:
    params = make_provider()._params(10, 5, "cat")
    assert params == {"api_key": "gk", "limit": 10, "offset": 5, "rating": "pg-13", "lang": "en", "q": "cat"}


def test_giphy_provider__params_omit_query_for_trending() -> None:
    assert "q" not in make_provider()._params(10, 0, None)


def test_giphy_provider__pick_image_uses_fallback_order() -> None:
    images = {"fixed_height": {"url": "https://x/y.gif"}}
    assert GiphyProvider._pick_image(images, ("fixed_height_small", "fixed_height")) == images["fixed_height"]


def test_giphy_provider__pick_image_returns_none_without_url() -> None:
    assert GiphyProvider._pick_image({"a": {"url": ""}, "b": "x"}, ("a", "b", "c")) is None


def test_giphy_provider__parse_item_maps_fields_and_converts_sizes() -> None:
    item = make_provider()._parse_item(raw_item())
    assert (item.id, item.preview_url, item.url) == (
        "abc",
        "https://media.giphy.com/s.gif",
        "https://media.giphy.com/d.gif",
    )
    assert (item.width, item.height) == (200, 150)


def test_giphy_provider__parse_item_falls_back_to_original() -> None:
    raw = raw_item(images={"fixed_height": {"url": "https://m.giphy.com/p"}, "original": {"url": "https://m.giphy.com/o"}})
    assert make_provider()._parse_item(raw).url == "https://m.giphy.com/o"


@pytest.mark.parametrize("raw", [None, "x", {"id": "1"}, {"id": "1", "images": {}}, {"images": {}}])
def test_giphy_provider__parse_item_skips_invalid(raw) -> None:
    assert make_provider()._parse_item(raw) is None


def test_giphy_provider__parse_page_sets_next_cursor() -> None:
    page = make_provider()._parse_page(payload(offset=20, count=10, total=100), 20)
    assert page.next == "30" and len(page.results) == 1


def test_giphy_provider__parse_page_has_no_next_at_end() -> None:
    assert make_provider()._parse_page(payload(offset=90, count=10, total=100), 90).next is None


def test_giphy_provider__parse_page_tolerates_missing_data() -> None:
    page = make_provider()._parse_page({}, 0)
    assert page.results == [] and page.next is None


async def test_giphy_provider__search_calls_giphy_with_params(mock_http) -> None:
    route = mock_http.get(f"{GIPHY_BASE_URL}/search").respond(200, json=payload())
    page = await make_provider().search("cat", 24, "10")
    params = route.calls.last.request.url.params
    assert params["q"] == "cat" and params["offset"] == "10" and params["api_key"] == "gk"
    assert len(page.results) == 1


async def test_giphy_provider__search_maps_rate_limit(mock_http) -> None:
    mock_http.get(f"{GIPHY_BASE_URL}/search").respond(429)
    with pytest.raises(ApiError) as info:
        await make_provider().search("cat", 24, None)
    assert info.value.status_code == 429


async def test_giphy_provider__trending_calls_trending_endpoint(mock_http) -> None:
    route = mock_http.get(f"{GIPHY_BASE_URL}/trending").respond(200, json=payload())
    await make_provider().trending(12, None)
    assert "q" not in route.calls.last.request.url.params
    assert route.calls.last.request.url.params["limit"] == "12"


async def test_giphy_provider__trending_fails_without_key() -> None:
    with pytest.raises(ApiError) as info:
        await make_provider("").trending(12, None)
    assert info.value.status_code == 503
