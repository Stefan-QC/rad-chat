import pytest

from tests.helpers import ADMIN_ID, MEMBER_ID, SUPABASE_URL, make_client, mock_login

SETTINGS = f"{SUPABASE_URL}/rest/v1/app_settings"
AUDIT = f"{SUPABASE_URL}/rest/v1/audit_logs"
URL = "/api/admin/settings/retention"


async def test_admin_settings__get_retention_returns_days(mock_http) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    mock_http.get(SETTINGS).respond(200, json=[{"value": "14"}])
    async with make_client() as client:
        response = await client.get(URL, headers=headers)
    assert response.json() == {"days": 14}


async def test_admin_settings__put_retention_saves_value(mock_http) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    mock_http.post(SETTINGS).respond(201)
    mock_http.post(AUDIT).respond(201)
    async with make_client() as client:
        response = await client.put(URL, json={"days": 30}, headers=headers)
    assert response.json() == {"days": 30}


@pytest.mark.parametrize("body", [{"days": -1}, {"days": 3651}, {"days": "x"}, {}, {"days": 1, "x": 2}])
async def test_admin_settings__put_retention_validates_body(mock_http, body: dict) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    async with make_client() as client:
        response = await client.put(URL, json=body, headers=headers)
    assert response.status_code == 422


@pytest.mark.parametrize("method", ["GET", "PUT"])
async def test_admin_settings__routes_are_admin_only(mock_http, method: str) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member")
    async with make_client() as client:
        response = await client.request(method, URL, headers=headers, json={"days": 1})
    assert response.status_code == 403
