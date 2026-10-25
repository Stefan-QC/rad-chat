import pytest
from pydantic import ValidationError

from app.config import Settings, get_settings
from tests.helpers import make_settings


def test_config__defaults_are_safe() -> None:
    settings = Settings(_env_file=None)
    assert settings.gif_provider == "giphy"
    assert settings.enable_scheduler is False
    assert settings.rate_limit_per_minute == 60
    assert settings.max_body_bytes == 65536
    assert settings.timezone == "Europe/Amsterdam"


def test_config__invalid_gif_provider_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, gif_provider="other")


def test_config__normalize_supabase_url_strips_trailing_slash() -> None:
    assert make_settings(supabase_url=" https://x.test/ ").supabase_url == "https://x.test"


def test_config__validate_timezone_accepts_known_zone() -> None:
    assert make_settings(timezone="UTC").timezone == "UTC"


def test_config__validate_timezone_rejects_unknown_zone() -> None:
    with pytest.raises(ValidationError):
        make_settings(timezone="Mars/Olympus")


def test_config__origins_splits_and_drops_wildcard() -> None:
    settings = make_settings(allowed_origins="http://a.test/, *, http://b.test ,")
    assert settings.origins == ["http://a.test", "http://b.test"]


def test_config__origins_empty_when_unset() -> None:
    assert make_settings(allowed_origins="").origins == []


def test_config__job_token_enabled_depends_on_value() -> None:
    assert make_settings(job_token="x").job_token_enabled is True
    assert make_settings(job_token="").job_token_enabled is False


def test_config__rest_url_is_built_from_supabase_url() -> None:
    assert make_settings().rest_url == "https://sb.test/rest/v1"


def test_config__auth_url_is_built_from_supabase_url() -> None:
    assert make_settings().auth_url == "https://sb.test/auth/v1"


def test_config__get_settings_is_cached() -> None:
    get_settings.cache_clear()
    assert get_settings() is get_settings()
    get_settings.cache_clear()
