import httpx
import pytest

from app.clients.supabase_auth_admin import SupabaseAuthAdmin
from app.errors import ApiError
from tests.helpers import SUPABASE_URL, make_settings

AUTH = f"{SUPABASE_URL}/auth/v1"


def make_admin() -> SupabaseAuthAdmin:
    return SupabaseAuthAdmin(make_settings(), httpx.AsyncClient())


async def test_supabase_auth_admin__list_users_returns_users(mock_http) -> None:
    route = mock_http.get(f"{AUTH}/admin/users").respond(200, json={"users": [{"id": "1"}]})
    assert await make_admin().list_users(2, 50) == [{"id": "1"}]
    assert route.calls.last.request.url.params["page"] == "2"
    assert route.calls.last.request.headers["authorization"].startswith("Bearer ")


async def test_supabase_auth_admin__list_users_maps_server_errors(mock_http) -> None:
    mock_http.get(f"{AUTH}/admin/users").respond(500, text="internal secret")
    with pytest.raises(ApiError) as info:
        await make_admin().list_users(1, 50)
    assert info.value.status_code == 502 and "secret" not in info.value.message


def test_supabase_auth_admin__has_no_functions_to_write_accounts() -> None:
    writers = {"create_user", "invite", "update_user", "delete_user", "get_user"}
    assert not writers & set(dir(SupabaseAuthAdmin))
