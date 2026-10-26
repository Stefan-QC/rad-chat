import httpx
import pytest
from fastapi import Depends, FastAPI
from starlette.requests import Request

from app.errors import handle_api_error
from app.main import create_app
from app.security.dependencies import current_user, get_container, require_admin
from app.security.models import CurrentUser
from tests.helpers import ADMIN_ID, MEMBER_ID, make_container, mock_login


def build_client(container) -> httpx.AsyncClient:
    app = create_app(container.settings, container)

    @app.get("/me")
    async def me(user: CurrentUser = Depends(current_user)) -> dict:
        return {"id": str(user.id)}

    @app.get("/admin-only")
    async def admin_only(user: CurrentUser = Depends(require_admin)) -> dict:
        return {"id": str(user.id)}

    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t"
    )


def fake_request(headers: dict[str, str]) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "headers": raw})


def test_dependencies__get_container_reads_app_state() -> None:
    app = FastAPI()
    app.state.container = "box"
    request = Request({"type": "http", "headers": [], "app": app})
    assert get_container(request) == "box"


async def test_dependencies__current_user_requires_token() -> None:
    async with build_client(make_container()) as client:
        response = await client.get("/me")
    assert response.status_code == 401


async def test_dependencies__current_user_returns_user(mock_http) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member")
    async with build_client(make_container()) as client:
        response = await client.get("/me", headers=headers)
    assert response.json() == {"id": MEMBER_ID}


async def test_dependencies__current_user_applies_rate_limit(mock_http) -> None:
    headers = mock_login(mock_http, MEMBER_ID, "member")
    async with build_client(make_container(rate_limit_per_minute=1)) as client:
        first = await client.get("/me", headers=headers)
        second = await client.get("/me", headers=headers)
    assert (first.status_code, second.status_code) == (200, 429)


async def test_dependencies__require_admin_allows_admin(mock_http) -> None:
    headers = mock_login(mock_http, ADMIN_ID, "admin")
    async with build_client(make_container()) as client:
        assert (await client.get("/admin-only", headers=headers)).status_code == 200


@pytest.mark.parametrize("role", ["member", "guest"])
async def test_dependencies__require_admin_rejects_non_admin(mock_http, role: str) -> None:
    headers = mock_login(mock_http, MEMBER_ID, role)
    async with build_client(make_container()) as client:
        assert (await client.get("/admin-only", headers=headers)).status_code == 403


def test_dependencies__handler_import_is_available() -> None:
    assert handle_api_error is not None
