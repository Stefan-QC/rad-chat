"""Fabriek voor de gedeelde HTTP-client met verplichte timeouts."""

import httpx


def build_http_client(timeout_seconds: float = 10.0) -> httpx.AsyncClient:
    """Maakt een AsyncClient met timeout, zonder redirects."""
    return httpx.AsyncClient(
        timeout=httpx.Timeout(timeout_seconds, connect=5.0),
        follow_redirects=False,
        limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
    )
