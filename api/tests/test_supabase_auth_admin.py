import json

import httpx
import pytest

from app.clients.supabase_auth_admin import SupabaseAuthAdmin
from app.errors import ApiError
from tests.helpers import SUPABASE_URL, make_settings

AUTH = f"{SUPABASE_URL}/auth/v1"


def make_admin() -> SupabaseAuthAdmin:
    return SupabaseAuthAdmin(make_settings(), httpx.AsyncClient())


def test_supabase_auth_admin__is_duplicate_detects_email_exists() -> None:
    assert SupabaseAuthAdmin._is_duplicate(httpx.Response(422, json={"error_code": "email_exists"}))


def test_supabase_auth_admin__is_duplicate_false_for_other_error() -> None:
    assert not SupabaseAuthAdmin._is_duplicate(httpx.Response(422, json={"msg": "weak"}))


def test_supabase_auth_admin__is_duplicate_false_for_invalid_json() -> None:
    assert not SupabaseAuthAdmin._is_duplicate(httpx.Response(422, content=b"nope"))


def test_supabase_auth_admin__check_user_response_maps_404() -> None:
    with pytest.raises(ApiError) as info:
        make_admin()._check_user_response(httpx.Response(404))
    assert info.value.status_code == 404


def test_supabase_auth_admin__check_user_response_maps_duplicate_to_409() -> None:
    with pytest.raises(ApiError) as info:
        make_admin()._check_user_response(httpx.Response(422, json={"error_code": "email_exists"}))
    assert info.value.status_code == 409


def test_supabase_auth_admin__check_user_response_maps_rejection_to_400() -> None:
    with pytest.raises(ApiError) as info:
        make_admin()._check_user_response(httpx.Response(422, json={"msg": "weak password"}))
    assert info.value.status_code == 400


def test_supabase_auth_admin__check_user_response_maps_server_error_to_502() -> None:
    with pytest.raises(ApiError) as info:
        make_admin()._check_user_response(httpx.Response(500))
    assert info.value.status_code == 502


async def test_supabase_auth_admin__list_users_returns_users(mock_http) -> None:
    route = mock_http.get(f"{AUTH}/admin/users").respond(200, json={"users": [{"id": "1"}]})
    assert await make_admin().list_users(2, 50) == [{"id": "1"}]
    assert route.calls.last.request.url.params["page"] == "2"


async def test_supabase_auth_admin__get_user_returns_user(mock_http) -> None:
    mock_http.get(f"{AUTH}/admin/users/u1").respond(200, json={"id": "u1"})
    assert await make_admin().get_user("u1") == {"id": "u1"}


async def test_supabase_auth_admin__get_user_maps_404(mock_http) -> None:
    mock_http.get(f"{AUTH}/admin/users/u1").respond(404)
    with pytest.raises(ApiError) as info:
        await make_admin().get_user("u1")
    assert info.value.status_code == 404


async def test_supabase_auth_admin__create_user_sends_confirmed_user(mock_http) -> None:
    route = mock_http.post(f"{AUTH}/admin/users").respond(200, json={"id": "u1"})
    user = await make_admin().create_user("a@b.nl", "pw-long-enough", "Ann")
    body = json.loads(route.calls.last.request.content)
    assert user == {"id": "u1"}
    assert body["email_confirm"] is True
    assert body["user_metadata"] == {"display_name": "Ann"}


async def test_supabase_auth_admin__create_user_raises_409_on_duplicate(mock_http) -> None:
    mock_http.post(f"{AUTH}/admin/users").respond(422, json={"error_code": "email_exists"})
    with pytest.raises(ApiError) as info:
        await make_admin().create_user("a@b.nl", "pw-long-enough", None)
    assert info.value.status_code == 409


async def test_supabase_auth_admin__invite_includes_role_when_given(mock_http) -> None:
    route = mock_http.post(f"{AUTH}/invite").respond(200, json={"id": "u1"})
    await make_admin().invite("a@b.nl", "guest")
    assert json.loads(route.calls.last.request.content)["data"] == {"role": "guest"}


async def test_supabase_auth_admin__invite_without_role_has_no_data(mock_http) -> None:
    route = mock_http.post(f"{AUTH}/invite").respond(200, json={"id": "u1"})
    await make_admin().invite("a@b.nl", None)
    assert "data" not in json.loads(route.calls.last.request.content)


async def test_supabase_auth_admin__update_user_puts_attributes(mock_http) -> None:
    route = mock_http.put(f"{AUTH}/admin/users/u1").respond(200, json={"id": "u1"})
    await make_admin().update_user("u1", {"ban_duration": "none"})
    assert json.loads(route.calls.last.request.content) == {"ban_duration": "none"}
