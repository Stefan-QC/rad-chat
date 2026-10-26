import pytest

from tests.helpers import ADMIN_ID, MEMBER_ID, SUPABASE_URL, make_client, mock_login
from tests.test_export_service import CHANNEL, message

MESSAGES = f"{SUPABASE_URL}/rest/v1/messages"
AUDIT = f"{SUPABASE_URL}/rest/v1/audit_logs"


async def test_admin_export__export_messages_streams_csv_attachment(mock_http) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    messages = mock_http.get(MESSAGES).respond(200, json=[message(1, "=1+1")])
    mock_http.post(AUDIT).respond(201)
    async with make_client() as client:
        response = await client.get(
            "/api/admin/export",
            params={"channel_id": CHANNEL, "format": "csv", "since": "2025-01-01T00:00:00+00:00"},
            headers=headers,
        )
    assert response.status_code == 200
    assert response.headers["content-disposition"].startswith("attachment; filename=")
    assert "'=1+1" in response.text
    sent = messages.calls.last.request.url.params
    assert sent["channel_id"] == f"eq.{CHANNEL}" and sent["created_at"].startswith("gte.2025-01-01")


async def test_admin_export__export_messages_defaults_to_json(mock_http) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    mock_http.get(MESSAGES).respond(200, json=[message(1)])
    mock_http.post(AUDIT).respond(201)
    async with make_client() as client:
        response = await client.get("/api/admin/export", headers=headers)
    assert response.json()[0]["channel"] == "general"


@pytest.mark.parametrize("params", [{"channel_id": "nope"}, {"format": "xml"}, {"since": "yesterday"}])
async def test_admin_export__export_messages_validates_input(mock_http, params: dict) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    async with make_client() as client:
        response = await client.get("/api/admin/export", params=params, headers=headers)
    assert response.status_code == 422


@pytest.mark.parametrize("role", ["member", "guest"])
async def test_admin_export__export_messages_is_admin_only(mock_http, role: str) -> None:
    headers = mock_login(mock_http, MEMBER_ID, role)
    async with make_client() as client:
        response = await client.get("/api/admin/export", headers=headers)
    assert response.status_code == 403


async def test_admin_export__export_messages_maps_database_failure(mock_http) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    mock_http.get(MESSAGES).respond(500, text="db secret")
    async with make_client() as client:
        response = await client.get("/api/admin/export", headers=headers)
    assert response.status_code == 502 and "secret" not in response.text
