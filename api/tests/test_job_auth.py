import pytest
from starlette.requests import Request

from app.errors import ApiError
from tests.helpers import ADMIN_ID, MEMBER_ID, make_container, mock_login


def fake_request(headers: dict[str, str]) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "headers": raw})


def test_job_auth__token_matches_correct_token() -> None:
    assert make_container(job_token="s3cret").job_auth.token_matches("s3cret") is True


@pytest.mark.parametrize("provided", ["", "wrong", "s3cret ", "S3CRET"])
def test_job_auth__token_matches_rejects_wrong_token(provided: str) -> None:
    assert make_container(job_token="s3cret").job_auth.token_matches(provided) is False


def test_job_auth__token_matches_is_disabled_without_configured_token() -> None:
    auth = make_container(job_token="").job_auth
    assert auth.token_matches("") is False and auth.token_matches("anything") is False


def test_job_auth__token_matches_uses_constant_time_compare(monkeypatch) -> None:
    import hmac

    calls = []
    real = hmac.compare_digest
    monkeypatch.setattr(hmac, "compare_digest", lambda a, b: calls.append(1) or real(a, b))
    make_container(job_token="s3cret").job_auth.token_matches("x")
    assert calls == [1]


async def test_job_auth__authorize_accepts_job_token() -> None:
    auth = make_container(job_token="s3cret").job_auth
    assert await auth.authorize(fake_request({"X-Job-Token": "s3cret"})) == (None, "job-token")


async def test_job_auth__authorize_rejects_wrong_token_even_with_admin_bearer() -> None:
    auth = make_container(job_token="s3cret").job_auth
    with pytest.raises(ApiError) as info:
        await auth.authorize(fake_request({"X-Job-Token": "bad", "Authorization": "Bearer whatever-token"}))
    assert info.value.status_code == 401


async def test_job_auth__authorize_rejects_token_when_disabled() -> None:
    auth = make_container(job_token="").job_auth
    with pytest.raises(ApiError) as info:
        await auth.authorize(fake_request({"X-Job-Token": ""}))
    assert info.value.status_code == 401


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


async def test_job_auth__authorize_rate_limits_job_token() -> None:
    auth = make_container(job_token="s3cret", rate_limit_per_minute=1).job_auth
    request = fake_request({"X-Job-Token": "s3cret"})
    await auth.authorize(request)
    with pytest.raises(ApiError) as info:
        await auth.authorize(request)
    assert info.value.status_code == 429
