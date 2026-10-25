"""Datamodellen voor GIF-resultaten."""

from pydantic import BaseModel


class GifItem(BaseModel):
    """Eén GIF met een preview en de volledige versie."""

    id: str
    title: str = ""
    preview_url: str
    url: str
    width: int = 0
    height: int = 0


class GifPage(BaseModel):
    """Eén pagina met resultaten en een cursor voor de volgende pagina."""

    results: list[GifItem]
    next: str | None = None
