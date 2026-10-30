from app.admin.user_models import UserSummary


def test_user_models__user_summary_only_needs_an_id() -> None:
    summary = UserSummary(id="1")
    assert summary.email is None and summary.role is None and summary.last_sign_in_at is None


def test_user_models__user_summary_keeps_profile_fields() -> None:
    summary = UserSummary(id="1", email="a@b.nl", username="a", role="guest", expires_at="2030-01-01T00:00:00Z")
    assert (summary.username, summary.role, summary.expires_at) == ("a", "guest", "2030-01-01T00:00:00Z")
