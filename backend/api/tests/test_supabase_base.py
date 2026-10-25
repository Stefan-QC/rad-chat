import httpx
import pytest

from app.clients.supabase_base import SupabaseClientBase
from app.errors import ApiError
from tests.helpers import SUPABASE_URL, make_settings


def make_base() -> SupabaseClientBase:
    return SupabaseClientBase(make_settings(), httpx.AsyncClient())


def test_supabase_base__service_headers_contain_key() -> None:
    headers = make_base()._service_headers()
    assert headers["apikey"] == "service-key"
    assert headers["Authorization"] == "Bearer service-key"


def test_supabase_base__service_headers_merge_extra() -> None:
    assert make_base()._service_headers({"Prefer": "x"})["Prefer"] == "x"


async def test_supabase_base__send_returns_response(mock_http) -> None:
    mock_http.get(f"{SUPABASE_URL}/x").respond(200, json={"a": 1})
    response = await make_base()._send("GET", f"{SUPABASE_URL}/x")
    assert response.json() == {"a": 1}


async def test_supabase_base__send_maps_timeout_to_502(mock_http) -> None:
    mock_http.get(f"{SUPABASE_URL}/x").mock(side_effect=httpx.ReadTimeout("slow"))
    with pytest.raises(ApiError) as info:
        await make_base()._send("GET", f"{SUPABASE_URL}/x")
    assert info.value.status_code == 502


async def test_supabase_base__send_maps_network_error_to_502(mock_http) -> None:
    mock_http.get(f"{SUPABASE_URL}/x").mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(ApiError) as info:
        await make_base()._send("GET", f"{SUPABASE_URL}/x")
    assert info.value.message == "Upstream service unavailable"


def test_supabase_base__check_passes_on_success() -> None:
    make_base()._check(httpx.Response(200))


def test_supabase_base__check_raises_generic_502_on_error(caplog) -> None:
    with pytest.raises(ApiError) as info:
        make_base()._check(httpx.Response(500, text="secret-detail"))
    assert info.value.status_code == 502
    assert "secret-detail" not in caplog.text


def test_supabase_base__check_allows_accepted_status() -> None:
    make_base()._check(httpx.Response(404), accepted=(404,))
