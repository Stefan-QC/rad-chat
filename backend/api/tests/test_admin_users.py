import json

import pytest

from tests.helpers import ADMIN_ID, MEMBER_ID, SUPABASE_URL, make_client, make_container, mock_login
from tests.test_user_service import AUTH_USER, PROFILE

AUTH = f"{SUPABASE_URL}/auth/v1"
REST = f"{SUPABASE_URL}/rest/v1"
BASE = "/api/admin/users"
VALID_BODY = {"email": "m@example.com", "password": "super-secret-pw", "role": "member"}


def admin_headers(router) -> dict:
    return mock_login(router, ADMIN_ID, "admin")


def mock_mutation_backend(router) -> None:
    router.put(f"{AUTH}/admin/users/{MEMBER_ID}").respond(200, json=AUTH_USER)
    router.get(f"{AUTH}/admin/users/{MEMBER_ID}").respond(200, json=AUTH_USER)
    router.patch(f"{REST}/profiles").respond(200, json=[PROFILE])
    router.post(f"{REST}/audit_logs").respond(201)


@pytest.mark.parametrize(
    "method, path",
    [
        ("GET", BASE),
        ("POST", BASE),
        ("POST", f"{BASE}/invite"),
        ("POST", f"{BASE}/{MEMBER_ID}/deactivate"),
        ("POST", f"{BASE}/{MEMBER_ID}/reactivate"),
        ("POST", f"{BASE}/{MEMBER_ID}/password"),
        ("PUT", f"{BASE}/{MEMBER_ID}/role"),
    ],
)
@pytest.mark.parametrize("role", ["member", "guest"])
async def test_admin_users__all_routes_reject_non_admins(mock_http, method: str, path: str, role: str) -> None:
    headers = mock_login(mock_http, MEMBER_ID, role)
    async with make_client() as client:
        response = await client.request(method, path, headers=headers, json={})
    assert response.status_code == 403


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


async def test_admin_users__create_user_returns_201(mock_http) -> None:
    headers = admin_headers(mock_http)
    mock_http.post(f"{AUTH}/admin/users").respond(200, json=AUTH_USER)
    mock_http.patch(f"{REST}/profiles").respond(200, json=[PROFILE])
    mock_http.post(f"{REST}/audit_logs").respond(201)
    async with make_client() as client:
        response = await client.post(BASE, json=VALID_BODY, headers=headers)
    assert response.status_code == 201 and response.json()["email"] == "m@example.com"


async def test_admin_users__create_user_returns_409_on_duplicate(mock_http) -> None:
    headers = admin_headers(mock_http)
    mock_http.post(f"{AUTH}/admin/users").respond(422, json={"error_code": "email_exists"})
    async with make_client() as client:
        response = await client.post(BASE, json=VALID_BODY, headers=headers)
    assert response.status_code == 409


@pytest.mark.parametrize(
    "body",
    [
        {**VALID_BODY, "password": "short"},
        {**VALID_BODY, "role": "guest"},
        {**VALID_BODY, "role": "guest", "expires_at": "2001-01-01T00:00:00Z"},
        {**VALID_BODY, "email": "nope"},
        {**VALID_BODY, "is_admin": True},
    ],
)
async def test_admin_users__create_user_validates_body_without_echoing_password(mock_http, body: dict) -> None:
    headers = admin_headers(mock_http)
    async with make_client() as client:
        response = await client.post(BASE, json=body, headers=headers)
    assert response.status_code == 422
    assert "super-secret-pw" not in response.text


async def test_admin_users__invite_user_returns_201(mock_http) -> None:
    headers = admin_headers(mock_http)
    mock_http.post(f"{AUTH}/invite").respond(200, json={"id": MEMBER_ID})
    mock_http.post(f"{REST}/audit_logs").respond(201)
    async with make_client() as client:
        response = await client.post(f"{BASE}/invite", json={"email": "n@example.com"}, headers=headers)
    assert response.status_code == 201 and response.json()["id"] == MEMBER_ID


async def test_admin_users__deactivate_user_works(mock_http) -> None:
    headers = admin_headers(mock_http)
    mock_mutation_backend(mock_http)
    async with make_client() as client:
        response = await client.post(f"{BASE}/{MEMBER_ID}/deactivate", headers=headers)
    assert response.status_code == 200


async def test_admin_users__deactivate_user_refuses_self(mock_http) -> None:
    headers = admin_headers(mock_http)
    async with make_client() as client:
        response = await client.post(f"{BASE}/{ADMIN_ID}/deactivate", headers=headers)
    assert response.status_code == 400


async def test_admin_users__deactivate_user_rejects_invalid_id(mock_http) -> None:
    headers = admin_headers(mock_http)
    async with make_client() as client:
        response = await client.post(f"{BASE}/not-a-uuid/deactivate", headers=headers)
    assert response.status_code == 422


async def test_admin_users__reactivate_user_works(mock_http) -> None:
    headers = admin_headers(mock_http)
    mock_mutation_backend(mock_http)
    async with make_client() as client:
        response = await client.post(f"{BASE}/{MEMBER_ID}/reactivate", headers=headers)
    assert response.status_code == 200


async def test_admin_users__set_password_works_and_validates(mock_http) -> None:
    headers = admin_headers(mock_http)
    mock_mutation_backend(mock_http)
    async with make_client() as client:
        ok = await client.post(f"{BASE}/{MEMBER_ID}/password", json={"password": "a-long-new-password"}, headers=headers)
        bad = await client.post(f"{BASE}/{MEMBER_ID}/password", json={"password": "short"}, headers=headers)
    assert ok.json() == {"status": "ok"} and bad.status_code == 422


async def test_admin_users__set_role_works(mock_http) -> None:
    headers = admin_headers(mock_http)
    mock_mutation_backend(mock_http)
    async with make_client() as client:
        response = await client.put(f"{BASE}/{MEMBER_ID}/role", json={"role": "admin"}, headers=headers)
    assert response.status_code == 200


async def test_admin_users__set_role_refuses_self_demotion(mock_http) -> None:
    headers = admin_headers(mock_http)
    async with make_client() as client:
        response = await client.put(f"{BASE}/{ADMIN_ID}/role", json={"role": "member"}, headers=headers)
    assert response.status_code == 400


async def test_admin_users__routes_require_authentication() -> None:
    async with make_client(make_container()) as client:
        assert (await client.get(BASE)).status_code == 401
    assert json is not None
