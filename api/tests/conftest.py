"""Gedeelde fixtures: alle HTTP-verkeer wordt door respx onderschept."""

import pytest
import respx


@pytest.fixture
def mock_http():
    """Onderschept alle httpx-verzoeken zodat er nooit echt netwerkverkeer is."""
    with respx.mock(assert_all_called=False, assert_all_mocked=True) as router:
        yield router
