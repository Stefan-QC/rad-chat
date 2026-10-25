import httpx

from app.gifs.gif_factory import GifProviderFactory
from app.gifs.giphy_provider import GiphyProvider
from app.gifs.klipy_provider import KlipyProvider
from tests.helpers import make_settings


def test_gif_factory__create_returns_giphy_by_default() -> None:
    provider = GifProviderFactory.create(make_settings(), httpx.AsyncClient())
    assert isinstance(provider, GiphyProvider)


def test_gif_factory__create_returns_klipy_when_configured() -> None:
    provider = GifProviderFactory.create(make_settings(gif_provider="klipy"), httpx.AsyncClient())
    assert isinstance(provider, KlipyProvider)
