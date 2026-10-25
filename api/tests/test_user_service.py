import json
from datetime import UTC, datetime, timedelta

import pytest

from app.admin.user_models import CreateUserRequest, InviteUserRequest, RoleRequest
from app.admin.user_service import UserAdminService
from app.errors import ApiError
from app.security.models import CurrentUser
from tests.helpers import ADMIN_ID, MEMBER_ID, SUPABASE_URL, make_container

AUTH = f"{SUPABASE_URL}/auth/v1"
REST = f"{SUPABASE_URL}/rest/v1"
ACTOR = CurrentUser(id=ADMIN_ID, role="admin")
AUTH_USER = {"id": MEMBER_ID, "email": "m@example.com", "last_sign_in_at": "s", "created_at": "c"}
PROFILE = {"id": MEMBER_ID, "username": "m", "display_name": "M", "role": "member", "expires_at": None, "deactivated_at": None}


def service() -> UserAdminService:
    return make_container().user_admin


def audit_actions(router) -> list[str]:
    return [
        json.loads(c.request.content)["action"]
        for c in router.calls
        if c.request.url.path.endswith("/audit_logs")
    ]


def test_user_service__summary_merges_auth_and_profile() -> None:
    summary = UserAdminService._summary(AUTH_USER, PROFILE)
    assert (summary.email, summary.username, summary.role, summary.created_at) == ("m@example.com", "m", "member", "c")


def test_user_service__summary_tolerates_missing_profile() -> None:
    assert UserAdminService._summary(AUTH_USER, None).role is None


def test_user_service__guard_self_blocks_own_id() -> None:
    with pytest.raises(ApiError) as info:
        UserAdminService._guard_self(ACTOR, ADMIN_ID, "no")
    assert info.value.status_code == 400


def test_user_service__guard_self_allows_other_id() -> None:
    UserAdminService._guard_self(ACTOR, MEMBER_ID, "no")


async def test_user_service__profiles_by_id_queries_in_filter(mock_http) -> None:
    route = mock_http.get(f"{REST}/profiles").respond(200, json=[PROFILE])
    result = await service()._profiles_by_id([MEMBER_ID, ADMIN_ID])
    assert result == {MEMBER_ID: PROFILE}
    assert route.calls.last.request.url.params["id"] == f"in.({MEMBER_ID},{ADMIN_ID})"


async def test_user_service__profiles_by_id_skips_call_for_empty_list(mock_http) -> None:
    assert await service()._profiles_by_id([]) == {}
    assert mock_http.calls.call_count == 0


async def test_user_service__patch_profile_returns_profile(mock_http) -> None:
    mock_http.patch(f"{REST}/profiles").respond(200, json=[PROFILE])
    assert await service()._patch_profile(MEMBER_ID, {"role": "member"}) == PROFILE


async def test_user_service__patch_profile_404_when_missing(mock_http) -> None:
    mock_http.patch(f"{REST}/profiles").respond(200, json=[])
    with pytest.raises(ApiError) as info:
        await service()._patch_profile(MEMBER_ID, {})
    assert info.value.status_code == 404


async def test_user_service__updated_summary_loads_auth_user(mock_http) -> None:
    mock_http.get(f"{AUTH}/admin/users/{MEMBER_ID}").respond(200, json=AUTH_USER)
    summary = await service()._updated_summary(MEMBER_ID, PROFILE)
    assert summary.email == "m@example.com"


async def test_user_service__list_users_merges_profiles(mock_http) -> None:
    mock_http.get(f"{AUTH}/admin/users").respond(200, json={"users": [AUTH_USER]})
    mock_http.get(f"{REST}/profiles").respond(200, json=[PROFILE])
    users = await service().list_users(1, 50)
    assert users[0].username == "m" and users[0].email == "m@example.com"


async def test_user_service__create_user_creates_patches_and_audits(mock_http) -> None:
    auth_route = mock_http.post(f"{AUTH}/admin/users").respond(200, json=AUTH_USER)
    patch_route = mock_http.patch(f"{REST}/profiles").respond(200, json=[PROFILE])
    mock_http.post(f"{REST}/audit_logs").respond(201)
    expires = datetime.now(UTC) + timedelta(days=3)
    request = CreateUserRequest(
        email="m@example.com", password="super-secret-pw", display_name="M", role="guest", expires_at=expires
    )
    summary = await service().create_user(ACTOR, request)
    assert summary.id == MEMBER_ID
    assert json.loads(auth_route.calls.last.request.content)["email_confirm"] is True
    assert json.loads(patch_route.calls.last.request.content)["role"] == "guest"
    audit = [c for c in mock_http.calls if c.request.url.path.endswith("/audit_logs")][0]
    assert "super-secret-pw" not in audit.request.content.decode()
    assert json.loads(audit.request.content)["action"] == "admin.user.create"


async def test_user_service__create_user_returns_409_on_duplicate(mock_http) -> None:
    mock_http.post(f"{AUTH}/admin/users").respond(422, json={"error_code": "email_exists"})
    request = CreateUserRequest(email="m@example.com", password="super-secret-pw")
    with pytest.raises(ApiError) as info:
        await service().create_user(ACTOR, request)
    assert info.value.status_code == 409


async def test_user_service__create_user_reports_profile_failure(mock_http) -> None:
    mock_http.post(f"{AUTH}/admin/users").respond(200, json=AUTH_USER)
    mock_http.patch(f"{REST}/profiles").respond(200, json=[])
    with pytest.raises(ApiError) as info:
        await service().create_user(ACTOR, CreateUserRequest(email="m@example.com", password="super-secret-pw"))
    assert info.value.status_code == 502


async def test_user_service__invite_sends_invite_and_audits(mock_http) -> None:
    route = mock_http.post(f"{AUTH}/invite").respond(200, json={"id": MEMBER_ID})
    mock_http.post(f"{REST}/audit_logs").respond(201)
    result = await service().invite(ACTOR, InviteUserRequest(email="m@example.com", role="member"))
    assert result == {"id": MEMBER_ID, "email": "m@example.com"}
    assert json.loads(route.calls.last.request.content)["data"] == {"role": "member"}
    assert audit_actions(mock_http) == ["admin.user.invite"]


async def test_user_service__deactivate_bans_and_patches(mock_http) -> None:
    ban = mock_http.put(f"{AUTH}/admin/users/{MEMBER_ID}").respond(200, json=AUTH_USER)
    patch = mock_http.patch(f"{REST}/profiles").respond(200, json=[PROFILE])
    mock_http.get(f"{AUTH}/admin/users/{MEMBER_ID}").respond(200, json=AUTH_USER)
    mock_http.post(f"{REST}/audit_logs").respond(201)
    await service().deactivate(ACTOR, MEMBER_ID)
    assert json.loads(ban.calls.last.request.content) == {"ban_duration": "876000h"}
    assert json.loads(patch.calls.last.request.content)["deactivated_at"]
    assert audit_actions(mock_http) == ["admin.user.deactivate"]


async def test_user_service__deactivate_refuses_self(mock_http) -> None:
    with pytest.raises(ApiError):
        await service().deactivate(ACTOR, ADMIN_ID)
    assert mock_http.calls.call_count == 0


async def test_user_service__reactivate_unbans_and_clears_date(mock_http) -> None:
    ban = mock_http.put(f"{AUTH}/admin/users/{MEMBER_ID}").respond(200, json=AUTH_USER)
    patch = mock_http.patch(f"{REST}/profiles").respond(200, json=[PROFILE])
    mock_http.get(f"{AUTH}/admin/users/{MEMBER_ID}").respond(200, json=AUTH_USER)
    mock_http.post(f"{REST}/audit_logs").respond(201)
    await service().reactivate(ACTOR, MEMBER_ID)
    assert json.loads(ban.calls.last.request.content) == {"ban_duration": "none"}
    assert json.loads(patch.calls.last.request.content) == {"deactivated_at": None}
    assert audit_actions(mock_http) == ["admin.user.reactivate"]


async def test_user_service__reactivate_refuses_self() -> None:
    with pytest.raises(ApiError):
        await service().reactivate(ACTOR, ADMIN_ID)


async def test_user_service__set_password_updates_and_never_audits_password(mock_http) -> None:
    mock_http.put(f"{AUTH}/admin/users/{MEMBER_ID}").respond(200, json=AUTH_USER)
    mock_http.post(f"{REST}/audit_logs").respond(201)
    assert await service().set_password(ACTOR, MEMBER_ID, "brand-new-secret") == {"status": "ok"}
    audit = [c for c in mock_http.calls if c.request.url.path.endswith("/audit_logs")][0]
    assert "brand-new-secret" not in audit.request.content.decode()


async def test_user_service__set_role_patches_profile_and_audits(mock_http) -> None:
    patch = mock_http.patch(f"{REST}/profiles").respond(200, json=[{**PROFILE, "role": "admin"}])
    mock_http.get(f"{AUTH}/admin/users/{MEMBER_ID}").respond(200, json=AUTH_USER)
    mock_http.post(f"{REST}/audit_logs").respond(201)
    summary = await service().set_role(ACTOR, MEMBER_ID, RoleRequest(role="admin"))
    assert summary.role == "admin"
    assert json.loads(patch.calls.last.request.content) == {"role": "admin", "expires_at": None}
    assert audit_actions(mock_http) == ["admin.user.role"]


async def test_user_service__set_role_refuses_self_demotion(mock_http) -> None:
    with pytest.raises(ApiError) as info:
        await service().set_role(ACTOR, ADMIN_ID, RoleRequest(role="member"))
    assert info.value.status_code == 400
    assert mock_http.calls.call_count == 0
