import json
from datetime import UTC, datetime

import pytest

from app.admin.export_service import COLUMNS, ExportService
from app.security.models import CurrentUser
from tests.helpers import ADMIN_ID, SUPABASE_URL, make_container

MESSAGES = f"{SUPABASE_URL}/rest/v1/messages"
AUDIT = f"{SUPABASE_URL}/rest/v1/audit_logs"
CHANNEL = "44444444-4444-4444-4444-444444444444"
ACTOR = CurrentUser(id=ADMIN_ID, role="admin")


def message(index: int = 1, body: str = "hello") -> dict:
    return {
        "id": index,
        "created_at": "2025-01-01T10:00:00Z",
        "body": body,
        "deleted_at": None,
        "parent_id": None,
        "channel": {"name": "general"},
        "author": {"username": "ann", "display_name": "Ann"},
    }


def service() -> ExportService:
    return make_container().export_service


async def collect(stream) -> bytes:
    return b"".join([chunk async for chunk in stream])


@pytest.mark.parametrize("dangerous", ["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\tTAB", "\rCR"])
def test_export_service__csv_safe_prefixes_formulas(dangerous: str) -> None:
    assert ExportService.csv_safe(dangerous) == "'" + dangerous


def test_export_service__csv_safe_keeps_normal_values() -> None:
    assert ExportService.csv_safe("hello") == "hello"
    assert ExportService.csv_safe(None) == ""
    assert ExportService.csv_safe(42) == "42"
    assert ExportService.csv_safe(-5) == "-5"


def test_export_service__flatten_handles_nested_and_missing() -> None:
    flat = ExportService.flatten(message())
    assert (flat["channel"], flat["author"], flat["author_display_name"]) == ("general", "ann", "Ann")
    empty = ExportService.flatten({"id": 1, "channel": None, "author": None})
    assert empty["channel"] is None and empty["author"] is None


def test_export_service__csv_line_quotes_and_neutralises_formulas() -> None:
    line = ExportService.csv_line(["a,b", '=HYPERLINK("x")', "plain"])
    assert line == b'"a,b","\'=HYPERLINK(""x"")",plain\r\n'


def test_export_service__query_params_filters_channel_and_since() -> None:
    since = datetime(2025, 1, 1, tzinfo=UTC)
    params = ExportService.query_params(CHANNEL, since)
    assert params["channel_id"] == f"eq.{CHANNEL}"
    assert params["created_at"].startswith("gte.2025-01-01T00:00:00")
    assert params["order"] == "id.asc"


def test_export_service__query_params_without_filters() -> None:
    params = ExportService.query_params(None, None)
    assert "channel_id" not in params and "created_at" not in params


async def test_export_service__pages_follows_range_until_short_page(mock_http) -> None:
    svc = service()
    svc.PAGE_SIZE = 2
    route = mock_http.get(MESSAGES).respond(200, json=[message(3)])
    pages = [p async for p in svc._pages({}, [message(1), message(2)])]
    assert [len(p) for p in pages] == [2, 1]
    assert route.calls.last.request.headers["Range"] == "2-3"


async def test_export_service__pages_yields_nothing_for_empty_first_page() -> None:
    assert [p async for p in service()._pages({}, [])] == []


async def test_export_service__csv_stream_writes_header_and_safe_rows() -> None:
    data = await collect(service()._csv_stream({}, [message(1, "=EVIL()")]))
    lines = data.decode().splitlines()
    assert lines[0] == ",".join(COLUMNS)
    assert "'=EVIL()" in lines[1]


async def test_export_service__json_stream_produces_valid_json() -> None:
    data = await collect(service()._json_stream({}, [message(1), message(2)]))
    parsed = json.loads(data)
    assert [row["id"] for row in parsed] == [1, 2]


async def test_export_service__json_stream_empty_is_empty_array() -> None:
    assert json.loads(await collect(service()._json_stream({}, []))) == []


async def test_export_service__export_audits_and_returns_csv(mock_http) -> None:
    mock_http.get(MESSAGES).respond(200, json=[message()])
    audit = mock_http.post(AUDIT).respond(201)
    result = await service().export(ACTOR, CHANNEL, None, "csv")
    assert result.media_type.startswith("text/csv") and result.filename.endswith(".csv")
    assert b"hello" in await collect(result.body)
    body = json.loads(audit.calls.last.request.content)
    assert body["action"] == "admin.export" and body["metadata"]["format"] == "csv"


async def test_export_service__export_json_without_channel(mock_http) -> None:
    mock_http.get(MESSAGES).respond(200, json=[])
    mock_http.post(AUDIT).respond(201)
    result = await service().export(ACTOR, None, None, "json")
    assert result.media_type == "application/json"
    assert json.loads(await collect(result.body)) == []
