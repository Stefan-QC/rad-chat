"""Endpoints voor het zoeken van GIF's."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.container import Container
from app.gifs.gif_models import GifPage
from app.security.dependencies import current_user, get_container
from app.security.models import CurrentUser

router = APIRouter(prefix="/api/gifs", tags=["gifs"])

Limit = Annotated[int, Query(ge=1, le=50)]
Cursor = Annotated[str | None, Query(max_length=64, pattern=r"^[A-Za-z0-9_.=-]+$")]
SearchText = Annotated[str, Query(min_length=1, max_length=80, pattern=r"\S")]


@router.get("/search")
async def search(
    q: SearchText,
    limit: Limit = 24,
    pos: Cursor = None,
    _user: CurrentUser = Depends(current_user),
    container: Container = Depends(get_container),
) -> GifPage:
    """Zoekt GIF's op trefwoord."""
    return await container.gif_service.search(q, limit, pos)


@router.get("/trending")
async def trending(
    limit: Limit = 24,
    pos: Cursor = None,
    _user: CurrentUser = Depends(current_user),
    container: Container = Depends(get_container),
) -> GifPage:
    """Haalt populaire GIF's op."""
    return await container.gif_service.trending(limit, pos)
