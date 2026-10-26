import json

import httpx
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel

from app.errors import (
    ApiError,
    handle_api_error,
    handle_unexpected_error,
    handle_validation_error,
)


class Payload(BaseModel):
    secret: str


def build_client() -> httpx.AsyncClient:
    app = FastAPI()
    app.add_exception_handler(ApiError, handle_api_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(Exception, handle_unexpected_error)

    @app.get("/api-error")
    async def api_error() -> None:
        raise ApiError(418, "teapot")

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("password=hunter2")

    @app.post("/payload")
    async def payload(body: Payload) -> None:
        return None

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    return httpx.AsyncClient(transport=transport, base_url="http://t")


def test_errors__api_error_keeps_status_and_message() -> None:
    error = ApiError(404, "nope")
    assert (error.status_code, error.message, str(error)) == (404, "nope", "nope")


async def test_errors__handle_api_error_returns_json() -> None:
    async with build_client() as client:
        response = await client.get("/api-error")
    assert response.status_code == 418
    assert response.json() == {"error": "teapot"}


async def test_errors__handle_validation_error_hides_input() -> None:
    async with build_client() as client:
        response = await client.post("/payload", json={"secret": 123, "extra": "hunter2"})
    assert response.status_code == 422
    assert "hunter2" not in response.text
    assert response.json()["details"][0]["field"] == "body.secret"


async def test_errors__handle_unexpected_error_hides_details() -> None:
    async with build_client() as client:
        response = await client.get("/boom")
    assert response.status_code == 500
    assert json.loads(response.text) == {"error": "Internal server error"}
    assert "hunter2" not in response.text


async def test_errors__handle_unexpected_error_logs_only_type(caplog) -> None:
    async with build_client() as client:
        await client.get("/boom")
    assert "RuntimeError" in caplog.text
    assert "hunter2" not in caplog.text
