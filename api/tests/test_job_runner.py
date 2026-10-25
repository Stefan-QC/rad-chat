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


STORAGE = f"{SUPABASE_URL}/storage/v1/object/chat-images"
FILE = "a" * 8 + "-aaaa-aaaa-aaaa-" + "a" * 12 + "/" + "b" * 8 + "-bbbb-bbbb-bbbb-" + "b" * 12 + "/" + "c" * 8 + "-cccc-cccc-cccc-" + "c" * 12 + ".png"


async def test_job_runner__cleanup_files_removes_the_stored_files(mock_http) -> None:
    mock_http.delete(STORAGE).respond(200, json=[{"name": FILE}])
    summary = {"deleted": 3, "storage_paths": [FILE]}
    await make_container().job_runner._cleanup_files(summary)
    assert summary == {"deleted": 3, "files_removed": 1}


async def test_job_runner__cleanup_files_ignores_summaries_without_paths(mock_http) -> None:
    summary = {"expired": 1}
    await make_container().job_runner._cleanup_files(summary)
    assert summary == {"expired": 1}


async def test_job_runner__cleanup_files_reports_zero_for_an_empty_list(mock_http) -> None:
    summary = {"deleted": 0, "storage_paths": []}
    await make_container().job_runner._cleanup_files(summary)
    assert summary == {"deleted": 0, "files_removed": 0}


async def test_job_runner__cleanup_files_survives_a_storage_failure(mock_http) -> None:
    mock_http.delete(STORAGE).respond(500)
    summary = {"deleted": 1, "storage_paths": [FILE]}
    await make_container().job_runner._cleanup_files(summary)
    assert summary == {"deleted": 1, "files_removed": 0, "files_failed": 1}


async def test_job_runner__run_purge_removes_files_and_keeps_paths_out_of_the_audit_log(mock_http) -> None:
    mock_http.post(f"{RPC}/jobs_purge_messages").respond(200, json={"deleted": 2, "days": 90, "storage_paths": [FILE]})
    mock_http.delete(STORAGE).respond(200, json=[{"name": FILE}])
    audit = mock_http.post(AUDIT).respond(201)
    summary = await make_container().job_runner.run("purge_messages", ADMIN_ID, "scheduler")
    assert summary["files_removed"] == 1 and "storage_paths" not in summary
    assert FILE not in audit.calls.last.request.content.decode()
