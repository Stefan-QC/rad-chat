"""Middleware voor beveiligingsheaders en een maximale request-grootte."""

from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "Cache-Control": "no-store",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Voegt beveiligingsheaders toe aan elk antwoord."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        """Zet de vaste headers op het antwoord."""
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers[name] = value
        return response


class BodyTooLargeError(Exception):
    """Wordt gegooid als de body groter is dan toegestaan."""


class BodyCounter:
    """Telt de ontvangen bytes en breekt af boven de limiet."""

    def __init__(self, receive: Receive, max_bytes: int) -> None:
        self._receive = receive
        self._max_bytes = max_bytes
        self._total = 0

    async def receive(self) -> Message:
        """Geeft het volgende bericht door en controleert de totale grootte."""
        message = await self._receive()
        if message["type"] == "http.request":
            self._total += len(message.get("body", b""))
            if self._total > self._max_bytes:
                raise BodyTooLargeError
        return message


class ResponseTracker:
    """Onthoudt of er al een antwoord is gestart."""

    def __init__(self, send: Send) -> None:
        self._send = send
        self.started = False

    async def send(self, message: Message) -> None:
        """Stuurt het bericht door en markeert de start van het antwoord."""
        if message["type"] == "http.response.start":
            self.started = True
        await self._send(message)


class BodySizeLimitMiddleware:
    """Weigert verzoeken met een te grote body met een 413."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self._app = app
        self._max_bytes = max_bytes

    @staticmethod
    def _declared_length(scope: Scope) -> int | None:
        """Leest de Content-Length header als geldig getal."""
        for name, value in scope.get("headers", []):
            if name == b"content-length":
                try:
                    return int(value)
                except ValueError:
                    return -1
        return None

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send, status_code: int, message: str) -> None:
        """Stuurt een foutantwoord."""
        response: Any = JSONResponse({"error": message}, status_code=status_code)
        await response(scope, receive, send)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        declared = self._declared_length(scope)
        if declared is not None and (declared < 0 or declared > self._max_bytes):
            status = 400 if declared < 0 else 413
            await self._reject(scope, receive, send, status, "Request body rejected")
            return
        counter = BodyCounter(receive, self._max_bytes)
        tracker = ResponseTracker(send)
        try:
            await self._app(scope, counter.receive, tracker.send)
        except BodyTooLargeError:
            if not tracker.started:
                await self._reject(scope, receive, send, 413, "Request body too large")
