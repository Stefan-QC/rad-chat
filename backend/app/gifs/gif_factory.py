"""Kiest de GIF-aanbieder op basis van de instellingen."""

import httpx

from app.config import Settings
from app.gifs.gif_provider import GifProvider
from app.gifs.giphy_provider import GiphyProvider
from app.gifs.klipy_provider import KlipyProvider


class GifProviderFactory:
    """Maakt de aanbieder die in GIF_PROVIDER is gekozen."""

    @staticmethod
    def create(settings: Settings, http: httpx.AsyncClient) -> GifProvider:
        """Geeft een Klipy- of Giphy-aanbieder terug."""
        if settings.gif_provider == "klipy":
            return KlipyProvider(http, settings.klipy_api_key)
        return GiphyProvider(http, settings.giphy_api_key, settings.gif_rating)
