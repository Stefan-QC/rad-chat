import json

import pytest

from tests.helpers import ADMIN_ID, MEMBER_ID, SUPABASE_URL, make_client, make_container, mock_login

RPC = f"{SUPABASE_URL}/rest/v1/rpc"
AUDIT = f"{SUPABASE_URL}/rest/v1/audit_logs"


@pytest.mark.parametrize("name", ["expire_guests", "purge_messages", "post_celebrations", "run_coffee_round"])
async def test_jobs__run_job_with_job_token_returns_summary(mock_http, name: str) -> None:
    mock_http.post(f"{RPC}/jobs_{name}").respond(200, json={"processed": 4})
    audit = mock_http.post(AUDIT).respond(201)
    async with make_client() as client:
        response = await client.post(f"/api/jobs/{name}", headers={"X-Job-Token": "job-secret"})
    assert response.status_code == 200 and response.json() == {"processed": 4}
    body = json.loads(audit.calls.last.request.content)
    assert body["action"] == f"admin.job.{name}" and body["actor_id"] is None


async def test_jobs__run_job_with_admin_bearer(mock_http) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    mock_http.post(f"{RPC}/jobs_expire_guests").respond(200, json={"expired": 1})
    audit = mock_http.post(AUDIT).respond(201)
    async with make_client() as client:
        response = await client.post("/api/jobs/expire_guests", headers=headers)
    assert response.json() == {"expired": 1}
    assert json.loads(audit.calls.last.request.content)["actor_id"] == ADMIN_ID


async def test_jobs__run_job_rejects_wrong_token(mock_http) -> None:
    async with make_client() as client:
        response = await client.post("/api/jobs/expire_guests", headers={"X-Job-Token": "nope"})
    assert response.status_code == 401
    assert not [c for c in mock_http.calls if "/rpc/" in c.request.url.path]


async def test_jobs__run_job_is_disabled_when_job_token_empty(mock_http) -> None:
    async with make_client(make_container(job_token="")) as client:
        response = await client.post("/api/jobs/expire_guests", headers={"X-Job-Token": ""})
    assert response.status_code == 401


async def test_jobs__run_job_rejects_member(mock_http) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member")
    async with make_client() as client:
        response = await client.post("/api/jobs/expire_guests", headers=headers)
    assert response.status_code == 403


async def test_jobs__run_job_rejects_unknown_name() -> None:
    async with make_client() as client:
        response = await client.post("/api/jobs/drop_database", headers={"X-Job-Token": "job-secret"})
    assert response.status_code == 422


async def test_jobs__run_job_hides_database_errors(mock_http) -> None:
    mock_http.post(f"{RPC}/jobs_purge_messages").respond(500, text="stack trace secret")
    async with make_client() as client:
        response = await client.post("/api/jobs/purge_messages", headers={"X-Job-Token": "job-secret"})
    assert response.status_code == 502 and "secret" not in response.text
