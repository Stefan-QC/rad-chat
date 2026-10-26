import json

from app.admin.audit_service import AuditService
from tests.helpers import ADMIN_ID, SUPABASE_URL, make_container

AUDIT_URL = f"{SUPABASE_URL}/rest/v1/audit_logs"


def test_audit_service__sanitize_removes_secret_keys() -> None:
    cleaned = AuditService._sanitize({"email": "a@b.nl", "password": "x", "Api_Key": "y", "job_token": "z"})
    assert cleaned == {"email": "a@b.nl"}


def test_audit_service__sanitize_handles_none() -> None:
    assert AuditService._sanitize(None) == {}


async def test_audit_service__record_writes_row(mock_http) -> None:
    route = mock_http.post(AUDIT_URL).respond(201)
    await make_container().audit.record(ADMIN_ID, "admin.export", "export", None, {"rows": 3, "password": "x"})
    body = json.loads(route.calls.last.request.content)
    assert body == {
        "actor_id": ADMIN_ID,
        "action": "admin.export",
        "entity_type": "export",
        "entity_id": None,
        "metadata": {"rows": 3},
    }


async def test_audit_service__record_swallows_failure_and_logs(mock_http, caplog) -> None:
    mock_http.post(AUDIT_URL).respond(500)
    await make_container().audit.record(ADMIN_ID, "admin.export", "export")
    assert "Audit log write failed" in caplog.text
