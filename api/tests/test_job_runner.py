import json

import pytest

from app.errors import ApiError
from app.jobs.job_runner import JOB_NAMES, JobRunner
from tests.helpers import ADMIN_ID, SUPABASE_URL, make_container

RPC = f"{SUPABASE_URL}/rest/v1/rpc"
AUDIT = f"{SUPABASE_URL}/rest/v1/audit_logs"


def test_job_runner__summary_keeps_dict() -> None:
    assert JobRunner._summary({"expired": 2}) == {"expired": 2}


def test_job_runner__summary_wraps_other_values() -> None:
    assert JobRunner._summary(5) == {"result": 5}
    assert JobRunner._summary(None) == {"result": None}


@pytest.mark.parametrize("name", JOB_NAMES)
async def test_job_runner__run_calls_rpc_and_audits(mock_http, name: str) -> None:
    rpc = mock_http.post(f"{RPC}/jobs_{name}").respond(200, json={"count": 3})
    audit = mock_http.post(AUDIT).respond(201)
    summary = await make_container().job_runner.run(name, ADMIN_ID, "admin")
    assert summary == {"count": 3}
    assert json.loads(rpc.calls.last.request.content) == {}
    body = json.loads(audit.calls.last.request.content)
    assert body["action"] == f"admin.job.{name}" and body["actor_id"] == ADMIN_ID


async def test_job_runner__run_propagates_database_failure(mock_http) -> None:
    mock_http.post(f"{RPC}/jobs_expire_guests").respond(500)
    with pytest.raises(ApiError):
        await make_container().job_runner.run("expire_guests", None, "scheduler")
