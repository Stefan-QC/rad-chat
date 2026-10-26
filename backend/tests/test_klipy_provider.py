import httpx
import pytest

from app.errors import ApiError
from app.gifs.klipy_provider import CUSTOMER_ID, KLIPY_BASE_URL, KlipyProvider

SEARCH_URL = f"{KLIPY_BASE_URL}/kk/gifs/search"
TRENDING_URL = f"{KLIPY_BASE_URL}/kk/gifs/trending"


def make_provider(key: str = "kk") -> KlipyProvider:
    return KlipyProvider(httpx.AsyncClient(), key)


def sized(size: str, width: int, height: int) -> dict:
    """Eén formaat zoals KLIPY het teruggeeft: dezelfde afbeelding als gif, webp en mp4."""
    return {
        "gif": {"url": f"https://static.klipy.com/{size}.gif", "width": width, "height": height, "size": 1000},
        "webp": {"url": f"https://static.klipy.com/{size}.webp", "width": width, "height": height, "size": 500},
        "mp4": {"url": f"https://static.klipy.com/{size}.mp4", "width": width, "height": height, "size": 300},
    }


def raw_item(**overrides) -> dict:
    item = {
        "slug": "dog-77",
        "title": "Dog",
        "blur_preview": "data:image/jpeg;base64,xx",
        "type": "gif",
        "file": {"hd": sized("hd", 800, 640), "md": sized("md", 300, 240), "sm": sized("sm", 100, 80), "xs": sized("xs", 50, 40)},
    }
    item.update(overrides)
    return item


def payload(items=None, has_next=True) -> dict:
    return {
        "result": True,
        "data": {"data": items if items is not None else [raw_item()], "current_page": 1, "has_next": has_next},
    }


def test_klipy_provider__page_number_parses_cursor() -> None:
    assert KlipyProvider._page_number("3") == 3
    assert KlipyProvider._page_number(None) == 1
    assert KlipyProvider._page_number("0") == 1


def test_klipy_provider__endpoint_contains_key_in_path() -> None:
    assert make_provider()._endpoint("search") == SEARCH_URL


@pytest.mark.parametrize("limit, expected", [(1, 8), (24, 24), (50, 50)])
def test_klipy_provider__params_clamp_per_page(limit: int, expected: int) -> None:
    assert KlipyProvider._params(limit, 1, "x")["per_page"] == expected


def test_klipy_provider__params_omit_query_when_none_and_send_an_anonymous_customer_id() -> None:
    params = KlipyProvider._params(24, 1, None)
    assert "q" not in params and params["customer_id"] == CUSTOMER_ID


def test_klipy_provider__gif_file_takes_the_first_available_size() -> None:
    files = {"sm": sized("sm", 100, 80), "hd": sized("hd", 800, 640)}
    assert KlipyProvider._gif_file(files, ("md", "sm", "hd")) == ("https://static.klipy.com/sm.gif", 100, 80)


@pytest.mark.parametrize("files", [None, [], "x", {}, {"md": "x"}, {"md": {"mp4": {"url": "https://a.klipy.com/m.mp4"}}}, {"md": {"gif": {"width": 1}}}])
def test_klipy_provider__gif_file_returns_none_without_a_gif(files) -> None:
    assert KlipyProvider._gif_file(files, ("md",)) is None


def test_klipy_provider__parse_item_picks_small_preview_and_medium_gif() -> None:
    item = make_provider()._parse_item(raw_item())
    assert item.preview_url.endswith("xs.gif") and item.url.endswith("md.gif")
    assert (item.id, item.title, item.width, item.height) == ("dog-77", "Dog", 300, 240)


def test_klipy_provider__parse_item_falls_back_to_other_sizes() -> None:
    raw = raw_item(file={"hd": sized("hd", 800, 640)})
    item = make_provider()._parse_item(raw)
    assert item.url.endswith("hd.gif") and item.preview_url.endswith("hd.gif")


def test_klipy_provider__parse_item_uses_id_when_there_is_no_slug() -> None:
    assert make_provider()._parse_item(raw_item(slug=None, id=5)).id == "5"


@pytest.mark.parametrize(
    "raw",
    [None, [], {"title": "x"}, raw_item(slug=None), raw_item(file={}), raw_item(type="ad"), {"type": "ad", "content": "<div>", "width": 300}],
)
def test_klipy_provider__parse_item_skips_ads_and_invalid_items(raw) -> None:
    assert make_provider()._parse_item(raw) is None


def test_klipy_provider__parse_page_sets_next_page_and_skips_ads() -> None:
    items = [raw_item(), {"type": "ad", "content": "<div>"}]
    page = make_provider()._parse_page(payload(items, has_next=True), 2, 24)
    assert page.next == "3" and len(page.results) == 1


def test_klipy_provider__parse_page_no_next_and_limit_applied() -> None:
    items = [raw_item(slug=f"g{i}") for i in range(5)]
    page = make_provider()._parse_page(payload(items, has_next=False), 1, 2)
    assert page.next is None and len(page.results) == 2


def test_klipy_provider__parse_page_tolerates_unexpected_shape() -> None:
    page = make_provider()._parse_page({"data": "oops"}, 1, 24)
    assert page.results == [] and page.next is None


async def test_klipy_provider__search_sends_query_params(mock_http) -> None:
    route = mock_http.get(SEARCH_URL).respond(200, json=payload())
    page = await make_provider().search("dog", 24, "2")
    params = route.calls.last.request.url.params
    assert params["q"] == "dog" and params["page"] == "2" and params["per_page"] == "24"
    assert len(page.results) == 1


async def test_klipy_provider__trending_uses_trending_endpoint(mock_http) -> None:
    mock_http.get(TRENDING_URL).respond(200, json=payload())
    assert len((await make_provider().trending(24, None)).results) == 1


async def test_klipy_provider__search_maps_server_error(mock_http) -> None:
    mock_http.get(SEARCH_URL).respond(503)
    with pytest.raises(ApiError) as info:
        await make_provider().search("dog", 24, None)
    assert info.value.status_code == 502
