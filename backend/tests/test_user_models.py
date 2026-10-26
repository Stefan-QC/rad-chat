from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError

from app.admin.user_models import (
    CreateUserRequest,
    InviteUserRequest,
    PasswordRequest,
    RoleRequest,
    UserSummary,
    validate_role_expiry,
)
from app.security.models import Role

FUTURE = datetime.now(UTC) + timedelta(days=5)
PAST = datetime.now(UTC) - timedelta(days=1)


def test_user_models__validate_role_expiry_requires_date_for_guest() -> None:
    with pytest.raises(ValueError):
        validate_role_expiry(Role.GUEST, None)


def test_user_models__validate_role_expiry_rejects_past_date() -> None:
    with pytest.raises(ValueError):
        validate_role_expiry(Role.GUEST, PAST)


def test_user_models__validate_role_expiry_accepts_future_and_naive_date() -> None:
    assert validate_role_expiry(Role.GUEST, FUTURE) == FUTURE
    assert validate_role_expiry(Role.GUEST, FUTURE.replace(tzinfo=None)).tzinfo is not None


def test_user_models__validate_role_expiry_ignores_date_for_non_guest() -> None:
    assert validate_role_expiry(Role.MEMBER, FUTURE) is None


def test_user_models__check_expiry_create_request_rejects_guest_without_date() -> None:
    with pytest.raises(ValidationError):
        CreateUserRequest(email="a@example.com", password="long-enough-pw", role="guest")


def test_user_models__check_expiry_create_request_accepts_guest_with_date() -> None:
    request = CreateUserRequest(email="a@example.com", password="long-enough-pw", role="guest", expires_at=FUTURE)
    assert request.expires_at == FUTURE


@pytest.mark.parametrize(
    "data",
    [
        {"email": "not-an-email", "password": "long-enough-pw"},
        {"email": "a@example.com", "password": "short"},
        {"email": "a@example.com", "password": "long-enough-pw", "role": "root"},
        {"email": "a@example.com", "password": "long-enough-pw", "extra": 1},
        {"email": "a@example.com", "password": "x" * 129},
        {"email": "a@example.com", "password": "long-enough-pw", "display_name": "x" * 81},
    ],
)
def test_user_models__create_request_rejects_invalid_input(data: dict) -> None:
    with pytest.raises(ValidationError):
        CreateUserRequest(**data)


def test_user_models__invite_request_role_is_optional() -> None:
    assert InviteUserRequest(email="a@example.com").role is None


def test_user_models__password_request_enforces_min_length() -> None:
    with pytest.raises(ValidationError):
        PasswordRequest(password="123456789")


def test_user_models__check_expiry_role_request_requires_date_for_guest() -> None:
    with pytest.raises(ValidationError):
        RoleRequest(role="guest")
    assert RoleRequest(role="admin").expires_at is None


def test_user_models__user_summary_defaults_to_none() -> None:
    assert UserSummary(id="1").email is None
