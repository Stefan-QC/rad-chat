import pytest
from starlette.requests import Request

from app.errors import ApiError
from app.security.bearer import extract_bearer


def fake_request(headers: dict[str, str]) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "headers": raw})


def test_bearer__extract_bearer_returns_token() -> None:
    assert extract_bearer(fake_request({"Authorization": "Bearer abc"})) == "abc"


def test_bearer__extract_bearer_is_case_insensitive_on_scheme() -> None:
    assert extract_bearer(fake_request({"Authorization": "bearer abc"})) == "abc"


@pytest.mark.parametrize("header", ["", "Basic abc", "Bearer ", "abc"])
def test_bearer__extract_bearer_rejects_bad_header(header: str) -> None:
    headers = {"Authorization": header} if header else {}
    with pytest.raises(ApiError) as info:
        extract_bearer(fake_request(headers))
    assert info.value.status_code == 401
