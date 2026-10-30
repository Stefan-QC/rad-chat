import pytest

from tests.helpers import ADMIN_ID, MEMBER_ID, SUPABASE_URL, make_client, mock_login
from tests.test_user_service import AUTH_USER, PROFILE

AUTH = f"{SUPABASE_URL}/auth/v1"
REST = f"{SUPABASE_URL}/rest/v1"
BASE = "/api/admin/users"


def admin_headers(router) -> dict:
    return mock_login(router, ADMIN_ID, "admin")


@pytest.mark.parametrize("role", ["member", "guest"])
async def test_admin_users__list_rejects_non_admins(mock_http, role: str) -> None:
    headers = mock_login(mock_http, MEMBER_ID, role)
    async with make_client() as client:
        response = await client.get(BASE, headers=headers)
    assert response.status_code == 403


async def test_admin_users__list_requires_a_token() -> None:
    async with make_client() as client:
        response = await client.get(BASE)
    assert response.status_code == 401


async def test_admin_users__list_users_returns_merged_users(mock_http) -> None:
    headers = admin_headers(mock_http)
    mock_http.get(f"{AUTH}/admin/users").respond(200, json={"users": [AUTH_USER]})
    mock_http.get(f"{REST}/profiles", params={"id": f"in.({MEMBER_ID})"}).respond(200, json=[PROFILE])
    async with make_client() as client:
        response = await client.get(BASE, headers=headers)
    assert response.status_code == 200
    assert response.json()[0]["username"] == "m"


async def test_admin_users__list_users_validates_paging(mock_http) -> None:
    headers = admin_headers(mock_http)
    async with make_client() as client:
        response = await client.get(BASE, params={"per_page": 1000}, headers=headers)
    assert response.status_code == 422


@pytest.mark.parametrize(
    "method, path",
    [
        ("POST", BASE),
        ("POST", f"{BASE}/invite"),
        ("POST", f"{BASE}/{MEMBER_ID}/deactivate"),
        ("POST", f"{BASE}/{MEMBER_ID}/reactivate"),
        ("POST", f"{BASE}/{MEMBER_ID}/password"),
        ("PUT", f"{BASE}/{MEMBER_ID}/password"),
        ("PUT", f"{BASE}/{MEMBER_ID}/role"),
        ("PUT", f"{BASE}/{MEMBER_ID}"),
        ("PATCH", f"{BASE}/{MEMBER_ID}"),
        ("DELETE", f"{BASE}/{MEMBER_ID}"),
    ],
)
async def test_admin_users__accounts_cannot_be_created_changed_or_deleted_through_the_api(mock_http, method: str, path: str) -> None:
    """Dit kan alleen in Supabase, ook voor een admin: de routes bestaan niet en er gaat niets naar Supabase."""
    headers = admin_headers(mock_http)
    calls_before = len(mock_http.calls)
    body = {"email": "x@example.com", "password": "a-long-new-password", "role": "admin"}
    async with make_client() as client:
        response = await client.request(method, path, headers=headers, json=body)
    assert response.status_code in (404, 405)
    writes = [call for call in list(mock_http.calls)[calls_before:] if call.request.method != "GET"]
    assert writes == []
