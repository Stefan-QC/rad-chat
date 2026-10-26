import json

import pytest
from pydantic import ValidationError

from app.admin.retention_service import RetentionRequest, RetentionResponse, RetentionSettingsService
from app.security.models import CurrentUser
from tests.helpers import ADMIN_ID, SUPABASE_URL, make_container

SETTINGS = f"{SUPABASE_URL}/rest/v1/app_settings"
AUDIT = f"{SUPABASE_URL}/rest/v1/audit_logs"
ACTOR = CurrentUser(id=ADMIN_ID, role="admin")


@pytest.mark.parametrize("days", [-1, 3651, "x"])
def test_retention_service__request_rejects_invalid_days(days) -> None:
    with pytest.raises(ValidationError):
        RetentionRequest(days=days)


@pytest.mark.parametrize("days", [0, 30, 3650])
def test_retention_service__request_accepts_valid_days(days: int) -> None:
    assert RetentionRequest(days=days).days == days


def test_retention_service__response_holds_days() -> None:
    assert RetentionResponse(days=5).days == 5


@pytest.mark.parametrize(
    "rows, expected",
    [([{"value": "30"}], 30), ([], 0), ([{"value": "abc"}], 0), ([{"value": None}], 0), ([{"value": "99999"}], 3650), ([{"value": "-4"}], 0)],
)
def test_retention_service__parse_is_defensive(rows, expected: int) -> None:
    assert RetentionSettingsService._parse(rows) == expected


async def test_retention_service__get_days_reads_setting(mock_http) -> None:
    route = mock_http.get(SETTINGS).respond(200, json=[{"value": "90"}])
    result = await make_container().retention_service.get_days()
    assert result.days == 90
    assert route.calls.last.request.url.params["key"] == "eq.message_retention_days"


async def test_retention_service__set_days_upserts_and_audits(mock_http) -> None:
    upsert = mock_http.post(SETTINGS).respond(201)
    audit = mock_http.post(AUDIT).respond(201)
    result = await make_container().retention_service.set_days(ACTOR, RetentionRequest(days=45))
    assert result.days == 45
    assert json.loads(upsert.calls.last.request.content) == {"key": "message_retention_days", "value": "45"}
    assert json.loads(audit.calls.last.request.content)["action"] == "admin.retention"
