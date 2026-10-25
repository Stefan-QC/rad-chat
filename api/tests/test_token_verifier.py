from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.errors import ApiError
from app.security.token_verifier import SupabaseTokenVerifier
from tests.helpers import ADMIN_ID, SUPABASE_URL, make_container, mock_login

TOKEN = f"token-{ADMIN_ID}"


def make_verifier() -> SupabaseTokenVerifier:
    container = make_container()
    return container.verifier


def profile(**overrides) -> dict:
    row = {"id": ADMIN_ID, "username": "u", "display_name": "U", "role": "member"}
    row.update(overrides)
    return row


def test_token_verifier__hash_token_is_stable_and_not_the_token() -> None:
    digest = SupabaseTokenVerifier.hash_token("secret")
    assert digest == SupabaseTokenVerifier.hash_token("secret")
    assert "secret" not in digest and len(digest) == 64


async def test_token_verifier__verify_returns_user(mock_http) -> None:
    mock_login(mock_http, ADMIN_ID, "admin")
    user = await make_verifier().verify(TOKEN)
    assert str(user.id) == ADMIN_ID and user.is_admin


async def test_token_verifier__verify_caches_token_check(mock_http) -> None:
    mock_login(mock_http, ADMIN_ID, "admin")
    verifier = make_verifier()
    await verifier.verify(TOKEN)
    await verifier.verify(TOKEN)
    auth_calls = [c for c in mock_http.calls if c.request.url.path == "/auth/v1/user"]
    assert len(auth_calls) == 1


async def test_token_verifier__verify_rejects_malformed_token() -> None:
    with pytest.raises(ApiError) as info:
        await make_verifier().verify("short")
    assert info.value.status_code == 401


async def test_token_verifier__verify_rejects_deactivated_user(mock_http) -> None:
    mock_login(mock_http, ADMIN_ID, "member", deactivated_at="2024-01-01T00:00:00+00:00")
    with pytest.raises(ApiError) as info:
        await make_verifier().verify(TOKEN)
    assert info.value.status_code == 403


async def test_token_verifier__authenticated_user_id_returns_id(mock_http) -> None:
    mock_http.get(f"{SUPABASE_URL}/auth/v1/user").respond(200, json={"id": ADMIN_ID})
    assert await make_verifier()._authenticated_user_id(TOKEN) == ADMIN_ID


async def test_token_verifier__authenticated_user_id_sends_apikey_and_bearer(mock_http) -> None:
    route = mock_http.get(f"{SUPABASE_URL}/auth/v1/user").respond(200, json={"id": ADMIN_ID})
    await make_verifier()._authenticated_user_id(TOKEN)
    headers = route.calls.last.request.headers
    assert headers["apikey"] == "anon-key" and headers["authorization"] == f"Bearer {TOKEN}"


async def test_token_verifier__authenticated_user_id_401_for_invalid_token(mock_http) -> None:
    mock_http.get(f"{SUPABASE_URL}/auth/v1/user").respond(401)
    with pytest.raises(ApiError) as info:
        await make_verifier()._authenticated_user_id(TOKEN)
    assert info.value.status_code == 401


async def test_token_verifier__authenticated_user_id_502_on_server_error(mock_http) -> None:
    mock_http.get(f"{SUPABASE_URL}/auth/v1/user").respond(500)
    with pytest.raises(ApiError) as info:
        await make_verifier()._authenticated_user_id(TOKEN)
    assert info.value.status_code == 502


async def test_token_verifier__authenticated_user_id_502_on_timeout(mock_http) -> None:
    mock_http.get(f"{SUPABASE_URL}/auth/v1/user").mock(side_effect=httpx.ReadTimeout("t"))
    with pytest.raises(ApiError) as info:
        await make_verifier()._authenticated_user_id(TOKEN)
    assert info.value.status_code == 502


async def test_token_verifier__authenticated_user_id_401_for_bad_payload(mock_http) -> None:
    mock_http.get(f"{SUPABASE_URL}/auth/v1/user").respond(200, json={"id": "not-a-uuid"})
    with pytest.raises(ApiError) as info:
        await make_verifier()._authenticated_user_id(TOKEN)
    assert info.value.status_code == 401


async def test_token_verifier__load_profile_returns_row(mock_http) -> None:
    mock_http.get(f"{SUPABASE_URL}/rest/v1/profiles").respond(200, json=[profile()])
    assert (await make_verifier()._load_profile(ADMIN_ID))["id"] == ADMIN_ID


async def test_token_verifier__load_profile_403_when_missing(mock_http) -> None:
    mock_http.get(f"{SUPABASE_URL}/rest/v1/profiles").respond(200, json=[])
    with pytest.raises(ApiError) as info:
        await make_verifier()._load_profile(ADMIN_ID)
    assert info.value.status_code == 403


def test_token_verifier__build_user_accepts_active_user() -> None:
    assert SupabaseTokenVerifier._build_user(profile()).role == "member"


def test_token_verifier__build_user_rejects_deactivated() -> None:
    with pytest.raises(ApiError):
        SupabaseTokenVerifier._build_user(profile(deactivated_at="2024-01-01T00:00:00Z"))


def test_token_verifier__build_user_rejects_expired_guest() -> None:
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    with pytest.raises(ApiError) as info:
        SupabaseTokenVerifier._build_user(profile(role="guest", expires_at=past))
    assert info.value.message == "Account has expired"


def test_token_verifier__build_user_accepts_future_and_naive_expiry() -> None:
    future = (datetime.now(UTC) + timedelta(days=1)).replace(tzinfo=None).isoformat()
    assert SupabaseTokenVerifier._build_user(profile(role="guest", expires_at=future))


def test_token_verifier__build_user_rejects_unknown_role() -> None:
    with pytest.raises(ApiError) as info:
        SupabaseTokenVerifier._build_user(profile(role="superuser"))
    assert info.value.status_code == 403
