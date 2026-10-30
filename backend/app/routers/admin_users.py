"""Beheerders-endpoint voor de ledenlijst; accounts maak en wijzig je alleen in Supabase."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.admin.user_models import UserSummary
from app.container import Container
from app.security.dependencies import get_container, require_admin
from app.security.models import CurrentUser

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


@router.get("")
async def list_users(
    page: Annotated[int, Query(ge=1, le=10000)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 50,
    _admin: CurrentUser = Depends(require_admin),
    container: Container = Depends(get_container),
) -> list[UserSummary]:
    """Geeft de gebruikers met profielgegevens."""
    return await container.user_admin.list_users(page, per_page)
