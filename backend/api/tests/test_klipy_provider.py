import httpx
import pytest

from app.errors import ApiError
from app.gifs.klipy_provider import KLIPY_BASE_URL, FileCandidate, KlipyProvider

SEARCH_URL = f"{KLIPY_BASE_URL}/kk/gifs/search"
TRENDING_URL = f"{KLIPY_BASE_URL}/kk/gifs/trending"


def make_provider(key: str = "kk") -> KlipyProvider:
    return KlipyProvider(httpx.AsyncClient(), key, "pg-13")


def raw_item(**overrides) -> dict:
    item = {
        "id": 77,
        "title": "Dog",
        "files": {
            "sm": {"gif": {"url": "https://static.klipy.com/sm.gif", "width": 100, "height": 80}},
            "md": {"gif": {"url": "https://static.klipy.com/md.gif", "width": 300, "height": 240}},
            "hd": {"gif": {"url": "https://static.klipy.com/hd.gif", "width": 800, "height": 640}},
        },
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
    assert make_provider()._params(limit, 1, "x")["per_page"] == expected


def test_klipy_provider__params_omit_query_when_none() -> None:
    assert "q" not in make_provider()._params(24, 1, None)


def test_klipy_provider__tokens_splits_and_lowercases() -> None:
    assert KlipyProvider._tokens(("MD", "gif-x")) == frozenset({"md", "gif", "x"})


def test_klipy_provider__collect_finds_nested_urls() -> None:
    found: list[FileCandidate] = []
    make_provider()._collect(raw_item()["files"], (), found)
    assert {c.url for c in found} == {
        "https://static.klipy.com/sm.gif",
        "https://static.klipy.com/md.gif",
        "https://static.klipy.com/hd.gif",
    }


def test_klipy_provider__collect_handles_plain_strings_and_lists() -> None:
    found: list[FileCandidate] = []
    make_provider()._collect({"sm": "https://a.klipy.com/s.gif", "md": [{"url": "https://a.klipy.com/m.gif"}]}, (), found)
    assert len(found) == 2


def test_klipy_provider__collect_ignores_other_types_and_depth() -> None:
    found: list[FileCandidate] = []
    provider = make_provider()
    provider._collect(5, (), found)
    provider._collect({"a": {"url": "https://x"}}, (), found, depth=99)
    assert found == []


def test_klipy_provider__pick_prefers_matching_tokens() -> None:
    cands = [
        FileCandidate(frozenset({"md", "mp4"}), "https://a/v.mp4", 0, 0),
        FileCandidate(frozenset({"md", "webp"}), "https://a/m.webp", 0, 0),
        FileCandidate(frozenset({"md", "gif"}), "https://a/m.gif", 0, 0),
    ]
    assert KlipyProvider._pick(cands, ("md",), smallest=False).url == "https://a/m.gif"


def test_klipy_provider__pick_falls_back_to_size() -> None:
    cands = [
        FileCandidate(frozenset({"a"}), "https://a/big", 500, 0),
        FileCandidate(frozenset({"b"}), "https://a/small", 50, 0),
    ]
    assert KlipyProvider._pick(cands, ("zz",), smallest=True).url == "https://a/small"
    assert KlipyProvider._pick(cands, ("zz",), smallest=False).url == "https://a/big"


def test_klipy_provider__pick_falls_back_to_position_without_sizes() -> None:
    cands = [FileCandidate(frozenset({"a"}), "https://a/1", 0, 0), FileCandidate(frozenset({"b"}), "https://a/2", 0, 0)]
    assert KlipyProvider._pick(cands, ("zz",), smallest=True).url == "https://a/1"
    assert KlipyProvider._pick(cands, ("zz",), smallest=False).url == "https://a/2"


def test_klipy_provider__pick_returns_none_for_empty() -> None:
    assert KlipyProvider._pick([], ("md",), smallest=True) is None


def test_klipy_provider__parse_item_picks_small_preview_and_medium_url() -> None:
    item = make_provider()._parse_item(raw_item())
    assert item.preview_url.endswith("sm.gif") and item.url.endswith("md.gif")
    assert (item.id, item.width, item.height) == ("77", 300, 240)


def test_klipy_provider__parse_item_uses_slug_and_tolerates_missing_size() -> None:
    raw = {"slug": "dog-1", "files": {"sm": {"url": "https://a.klipy.com/s.gif"}}}
    item = make_provider()._parse_item(raw)
    assert item.id == "dog-1" and item.width == 0 and item.url == item.preview_url


@pytest.mark.parametrize("raw", [None, [], {"title": "x"}, {"id": 1}, {"id": 1, "files": {}}])
def test_klipy_provider__parse_item_skips_invalid(raw) -> None:
    assert make_provider()._parse_item(raw) is None


def test_klipy_provider__parse_page_sets_next_page() -> None:
    page = make_provider()._parse_page(payload(has_next=True), 2, 24)
    assert page.next == "3" and len(page.results) == 1


def test_klipy_provider__parse_page_no_next_and_limit_applied() -> None:
    items = [raw_item(id=i) for i in range(5)]
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
