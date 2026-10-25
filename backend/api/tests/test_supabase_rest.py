import json

import httpx
import pytest

from app.clients.supabase_rest import SupabaseRest
from app.errors import ApiError
from tests.helpers import SUPABASE_URL, make_settings

REST = f"{SUPABASE_URL}/rest/v1"


def make_rest() -> SupabaseRest:
    return SupabaseRest(make_settings(), httpx.AsyncClient())


def test_supabase_rest__identifier_accepts_valid_name() -> None:
    assert SupabaseRest._identifier("audit_logs") == "audit_logs"


@pytest.mark.parametrize("bad", ["", "a/b", "../x", "A", "a b", "a?x=1"])
def test_supabase_rest__identifier_rejects_unsafe_name(bad: str) -> None:
    with pytest.raises(ValueError):
        SupabaseRest._identifier(bad)


def test_supabase_rest__table_url_is_built() -> None:
    assert make_rest()._table_url("profiles") == f"{REST}/profiles"


async def test_supabase_rest__select_sends_params_and_service_key(mock_http) -> None:
    route = mock_http.get(f"{REST}/profiles").respond(200, json=[{"id": "1"}])
    rows = await make_rest().select("profiles", {"id": "eq.1"})
    assert rows == [{"id": "1"}]
    request = route.calls.last.request
    assert request.url.params["id"] == "eq.1"
    assert request.headers["apikey"] == "service-key"


async def test_supabase_rest__select_raises_502_on_error(mock_http) -> None:
    mock_http.get(f"{REST}/profiles").respond(500)
    with pytest.raises(ApiError):
        await make_rest().select("profiles", {})


async def test_supabase_rest__select_range_sends_range_header(mock_http) -> None:
    route = mock_http.get(f"{REST}/messages").respond(206, json=[{"id": 1}])
    rows = await make_rest().select_range("messages", {}, 0, 999)
    assert rows == [{"id": 1}]
    assert route.calls.last.request.headers["Range"] == "0-999"


async def test_supabase_rest__select_range_returns_empty_on_416(mock_http) -> None:
    mock_http.get(f"{REST}/messages").respond(416)
    assert await make_rest().select_range("messages", {}, 1000, 1999) == []


async def test_supabase_rest__insert_posts_row(mock_http) -> None:
    route = mock_http.post(f"{REST}/audit_logs").respond(201)
    await make_rest().insert("audit_logs", {"action": "x"})
    request = route.calls.last.request
    assert json.loads(request.content) == {"action": "x"}
    assert request.headers["Prefer"] == "return=minimal"


async def test_supabase_rest__update_patches_with_filters(mock_http) -> None:
    route = mock_http.patch(f"{REST}/profiles").respond(200, json=[{"id": "1"}])
    rows = await make_rest().update("profiles", {"id": "eq.1"}, {"role": "admin"})
    assert rows == [{"id": "1"}]
    assert route.calls.last.request.url.params["id"] == "eq.1"


async def test_supabase_rest__upsert_uses_on_conflict(mock_http) -> None:
    route = mock_http.post(f"{REST}/app_settings").respond(201)
    await make_rest().upsert("app_settings", {"key": "k", "value": "1"}, "key")
    request = route.calls.last.request
    assert request.url.params["on_conflict"] == "key"
    assert "merge-duplicates" in request.headers["Prefer"]


async def test_supabase_rest__rpc_returns_json(mock_http) -> None:
    route = mock_http.post(f"{REST}/rpc/jobs_expire_guests").respond(200, json={"expired": 2})
    assert await make_rest().rpc("jobs_expire_guests") == {"expired": 2}
    assert json.loads(route.calls.last.request.content) == {}


async def test_supabase_rest__rpc_returns_none_on_empty_body(mock_http) -> None:
    mock_http.post(f"{REST}/rpc/jobs_x").respond(204)
    assert await make_rest().rpc("jobs_x") is None


async def test_supabase_rest__rpc_rejects_invalid_json(mock_http) -> None:
    mock_http.post(f"{REST}/rpc/jobs_x").respond(200, content=b"not json")
    with pytest.raises(ApiError):
        await make_rest().rpc("jobs_x")
