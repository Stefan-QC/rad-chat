"""Leest het bearer token uit een verzoek."""

from starlette.requests import Request

from app.errors import ApiError


def extract_bearer(request: Request) -> str:
    """Haalt het bearer token uit de Authorization-header."""
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "Missing bearer token")
    return token.strip()
