import pytest

from app.errors import ApiError
from app.jobs.job_scheduler import JobScheduler
from tests.helpers import SUPABASE_URL, make_container

RPC = f"{SUPABASE_URL}/rest/v1/rpc"
AUDIT = f"{SUPABASE_URL}/rest/v1/audit_logs"


class RecordingRunner:
    def __init__(self, fail_on: str | None = None, error: Exception | None = None) -> None:
        self.calls: list[tuple] = []
        self._fail_on = fail_on
        self._error = error or ApiError(502, "x")

    async def run(self, name, actor_id, via):
        self.calls.append((name, actor_id, via))
        if name == self._fail_on:
            raise self._error
        return {}


def test_job_scheduler__configure_registers_daily_and_weekly_jobs() -> None:
    scheduler = JobScheduler(RecordingRunner(), "Europe/Amsterdam")
    scheduler.configure()
    assert scheduler.job_ids() == ["daily", "weekly"]
    triggers = {job.id: str(job.trigger) for job in scheduler._scheduler.get_jobs()}
    assert "hour='7'" in triggers["daily"] and "minute='0'" in triggers["daily"]
    assert "day_of_week='mon'" in triggers["weekly"] and "hour='9'" in triggers["weekly"]


def test_job_scheduler__configure_uses_configured_timezone() -> None:
    scheduler = JobScheduler(RecordingRunner(), "UTC")
    scheduler.configure()
    assert "UTC" in str(scheduler._scheduler.get_jobs()[0].trigger.timezone)


def test_job_scheduler__job_ids_is_empty_before_configure() -> None:
    assert JobScheduler(RecordingRunner(), "UTC").job_ids() == []


async def test_job_scheduler__start_and_shutdown_manage_scheduler() -> None:
    scheduler = JobScheduler(RecordingRunner(), "UTC")
    scheduler.start()
    assert scheduler._scheduler.running and scheduler.job_ids() == ["daily", "weekly"]
    scheduler.shutdown()


def test_job_scheduler__shutdown_is_safe_when_not_running() -> None:
    JobScheduler(RecordingRunner(), "UTC").shutdown()


async def test_job_scheduler__run_daily_runs_jobs_in_order() -> None:
    runner = RecordingRunner()
    await JobScheduler(runner, "UTC").run_daily()
    assert [call[0] for call in runner.calls] == ["expire_guests", "post_celebrations", "purge_messages"]
    assert all(call[1:] == (None, "scheduler") for call in runner.calls)


async def test_job_scheduler__run_weekly_runs_coffee_round() -> None:
    runner = RecordingRunner()
    await JobScheduler(runner, "UTC").run_weekly()
    assert [call[0] for call in runner.calls] == ["run_coffee_round"]


async def test_job_scheduler__run_safely_logs_api_error_without_raising(caplog) -> None:
    runner = RecordingRunner(fail_on="expire_guests")
    await JobScheduler(runner, "UTC")._run_safely("expire_guests")
    assert "expire_guests failed with status 502" in caplog.text


async def test_job_scheduler__run_safely_swallows_unexpected_errors_without_secrets(caplog) -> None:
    runner = RecordingRunner(fail_on="purge_messages", error=RuntimeError("service-key=abc"))
    await JobScheduler(runner, "UTC")._run_safely("purge_messages")
    assert "RuntimeError" in caplog.text and "service-key" not in caplog.text


async def test_job_scheduler__daily_continues_after_failure() -> None:
    runner = RecordingRunner(fail_on="expire_guests")
    await JobScheduler(runner, "UTC").run_daily()
    assert len(runner.calls) == 3


async def test_job_scheduler__real_runner_end_to_end(mock_http) -> None:
    for name in ("expire_guests", "post_celebrations", "purge_messages"):
        mock_http.post(f"{RPC}/jobs_{name}").respond(200, json={"ok": True})
    mock_http.post(AUDIT).respond(201)
    await JobScheduler(make_container().job_runner, "UTC").run_daily()
    rpc_calls = [c for c in mock_http.calls if "/rpc/" in c.request.url.path]
    assert len(rpc_calls) == 3
    assert pytest is not None
