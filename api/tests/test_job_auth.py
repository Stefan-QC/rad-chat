import pytest
from starlette.requests import Request

from app.errors import ApiError
from tests.helpers import ADMIN_ID, MEMBER_ID, make_container, mock_login


def fake_request(headers: dict[str, str]) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "headers": raw})


async def test_job_auth__authorize_accepts_admin_bearer(mock_http) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    auth = make_container().job_auth
    assert await auth.authorize(fake_request(headers)) == (ADMIN_ID, "admin")


async def test_job_auth__authorize_rejects_non_admin_bearer(mock_http) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member")
    with pytest.raises(ApiError) as info:
        await make_container().job_auth.authorize(fake_request(headers))
    assert info.value.status_code == 403


async def test_job_auth__authorize_requires_some_credential() -> None:
    with pytest.raises(ApiError) as info:
        await make_container().job_auth.authorize(fake_request({}))
    assert info.value.status_code == 401


async def test_job_auth__authorize_ignores_a_job_token_header() -> None:
    with pytest.raises(ApiError) as info:
        await make_container().job_auth.authorize(fake_request({"X-Job-Token": "anything"}))
    assert info.value.status_code == 401


async def test_job_auth__authorize_rate_limits_admins(mock_http) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    auth = make_container(rate_limit_per_minute=1).job_auth
    request = fake_request(headers)
    await auth.authorize(request)
    with pytest.raises(ApiError) as info:
        await auth.authorize(request)
    assert info.value.status_code == 429
