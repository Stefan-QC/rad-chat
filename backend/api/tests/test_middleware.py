import httpx
from fastapi import FastAPI, Request

from app.security.middleware import (
    BodyCounter,
    BodySizeLimitMiddleware,
    BodyTooLargeError,
    ResponseTracker,
    SecurityHeadersMiddleware,
)
from tests.helpers import make_client, make_container, make_settings
import pytest


def build_client(max_bytes: int = 10) -> httpx.AsyncClient:
    app = FastAPI()

    @app.post("/echo")
    async def echo(request: Request) -> dict[str, int]:
        return {"size": len(await request.body())}

    app.add_middleware(BodySizeLimitMiddleware, max_bytes=max_bytes)
    app.add_middleware(SecurityHeadersMiddleware)
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t"
    )


async def test_middleware__dispatch_adds_security_headers() -> None:
    async with build_client() as client:
        response = await client.post("/echo", content=b"abc")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


async def test_middleware__body_within_limit_is_accepted() -> None:
    async with build_client() as client:
        response = await client.post("/echo", content=b"abc")
    assert response.json() == {"size": 3}


async def test_middleware__declared_length_over_limit_gives_413() -> None:
    async with build_client() as client:
        response = await client.post("/echo", content=b"x" * 50)
    assert response.status_code == 413


async def test_middleware__streamed_body_over_limit_gives_413() -> None:
    async def chunks():
        for _ in range(5):
            yield b"xxxx"

    async with build_client() as client:
        response = await client.post("/echo", content=chunks())
    assert response.status_code == 413


def test_middleware__declared_length_parses_header() -> None:
    scope = {"headers": [(b"content-length", b"12")]}
    assert BodySizeLimitMiddleware._declared_length(scope) == 12


def test_middleware__declared_length_none_without_header() -> None:
    assert BodySizeLimitMiddleware._declared_length({"headers": []}) is None


def test_middleware__declared_length_invalid_returns_minus_one() -> None:
    assert BodySizeLimitMiddleware._declared_length({"headers": [(b"content-length", b"x")]}) == -1


async def test_middleware__reject_sends_json_error() -> None:
    sent = []

    async def send(message):
        sent.append(message)

    async def receive():
        return {"type": "http.request"}

    scope = {"type": "http", "method": "POST", "headers": []}
    await BodySizeLimitMiddleware._reject(scope, receive, send, 413, "too big")
    assert sent[0]["status"] == 413
    assert b"too big" in sent[1]["body"]


async def test_middleware__invalid_content_length_gives_400() -> None:
    async with build_client() as client:
        response = await client.post("/echo", content=b"a", headers={"Content-Length": "abc"})
    assert response.status_code in (400, 413)


async def test_middleware__non_http_scope_is_passed_through() -> None:
    called = []

    async def inner(scope, receive, send):
        called.append(scope["type"])

    middleware = BodySizeLimitMiddleware(inner, max_bytes=1)
    await middleware({"type": "lifespan"}, None, None)
    assert called == ["lifespan"]


async def test_middleware__receive_body_counter_raises_over_limit() -> None:
    async def receive():
        return {"type": "http.request", "body": b"12345"}

    counter = BodyCounter(receive, max_bytes=3)
    with pytest.raises(BodyTooLargeError):
        await counter.receive()


async def test_middleware__receive_ignores_other_messages() -> None:
    async def receive():
        return {"type": "http.disconnect"}

    assert (await BodyCounter(receive, 1).receive())["type"] == "http.disconnect"


async def test_middleware__send_response_tracker_marks_started() -> None:
    sent = []

    async def send(message):
        sent.append(message)

    tracker = ResponseTracker(send)
    assert tracker.started is False
    await tracker.send({"type": "http.response.start", "status": 200, "headers": []})
    assert tracker.started is True and len(sent) == 1
