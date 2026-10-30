from app.admin.user_service import UserAdminService
from tests.helpers import ADMIN_ID, MEMBER_ID, SUPABASE_URL, make_container

AUTH = f"{SUPABASE_URL}/auth/v1"
REST = f"{SUPABASE_URL}/rest/v1"
AUTH_USER = {"id": MEMBER_ID, "email": "m@example.com", "last_sign_in_at": "s", "created_at": "c"}
PROFILE = {"id": MEMBER_ID, "username": "m", "display_name": "M", "role": "member", "expires_at": None, "deactivated_at": None}


def service() -> UserAdminService:
    return make_container().user_admin


def test_user_service__summary_merges_auth_and_profile() -> None:
    summary = UserAdminService._summary(AUTH_USER, PROFILE)
    assert (summary.email, summary.username, summary.role, summary.created_at) == ("m@example.com", "m", "member", "c")


def test_user_service__summary_tolerates_missing_profile() -> None:
    assert UserAdminService._summary(AUTH_USER, None).role is None


async def test_user_service__profiles_by_id_queries_in_filter(mock_http) -> None:
    route = mock_http.get(f"{REST}/profiles").respond(200, json=[PROFILE])
    result = await service()._profiles_by_id([MEMBER_ID, ADMIN_ID])
    assert result == {MEMBER_ID: PROFILE}
    assert route.calls.last.request.url.params["id"] == f"in.({MEMBER_ID},{ADMIN_ID})"


async def test_user_service__profiles_by_id_skips_call_for_empty_list(mock_http) -> None:
    assert await service()._profiles_by_id([]) == {}
    assert mock_http.calls.call_count == 0


async def test_user_service__list_users_merges_profiles(mock_http) -> None:
    mock_http.get(f"{AUTH}/admin/users").respond(200, json={"users": [AUTH_USER]})
    mock_http.get(f"{REST}/profiles").respond(200, json=[PROFILE])
    users = await service().list_users(1, 50)
    assert [(user.email, user.username) for user in users] == [("m@example.com", "m")]


def test_user_service__only_reads_accounts() -> None:
    """Accounts maak, wijzig, deactiveer en verwijder je alleen in Supabase: de service heeft geen schrijffuncties."""
    forbidden = {"create_user", "invite", "deactivate", "reactivate", "set_role", "set_password", "delete_user", "update_user"}
    assert not forbidden & set(dir(UserAdminService))
