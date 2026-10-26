from app.security.models import CurrentUser, Role
from tests.helpers import ADMIN_ID


def test_models__is_admin_true_for_admin() -> None:
    assert CurrentUser(id=ADMIN_ID, role=Role.ADMIN).is_admin is True


def test_models__is_admin_false_for_guest_and_member() -> None:
    assert CurrentUser(id=ADMIN_ID, role="guest").is_admin is False
    assert CurrentUser(id=ADMIN_ID, role="member").is_admin is False
