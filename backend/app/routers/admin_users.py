"""Beheerders-endpoints voor gebruikersbeheer."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.admin.user_models import (
    CreateUserRequest,
    InviteUserRequest,
    PasswordRequest,
    RoleRequest,
    UserSummary,
)
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


@router.post("", status_code=201)
async def create_user(
    body: CreateUserRequest,
    admin: CurrentUser = Depends(require_admin),
    container: Container = Depends(get_container),
) -> UserSummary:
    """Maakt een gebruiker aan."""
    return await container.user_admin.create_user(admin, body)


@router.post("/invite", status_code=201)
async def invite_user(
    body: InviteUserRequest,
    admin: CurrentUser = Depends(require_admin),
    container: Container = Depends(get_container),
) -> dict:
    """Nodigt een gebruiker uit per e-mail."""
    return await container.user_admin.invite(admin, body)


@router.post("/{user_id}/deactivate")
async def deactivate_user(
    user_id: UUID,
    admin: CurrentUser = Depends(require_admin),
    container: Container = Depends(get_container),
) -> UserSummary:
    """Deactiveert een gebruiker."""
    return await container.user_admin.deactivate(admin, str(user_id))


@router.post("/{user_id}/reactivate")
async def reactivate_user(
    user_id: UUID,
    admin: CurrentUser = Depends(require_admin),
    container: Container = Depends(get_container),
) -> UserSummary:
    """Heractiveert een gebruiker."""
    return await container.user_admin.reactivate(admin, str(user_id))


@router.post("/{user_id}/password")
async def set_password(
    user_id: UUID,
    body: PasswordRequest,
    admin: CurrentUser = Depends(require_admin),
    container: Container = Depends(get_container),
) -> dict:
    """Stelt een nieuw wachtwoord in."""
    return await container.user_admin.set_password(admin, str(user_id), body.password)


@router.put("/{user_id}/role")
async def set_role(
    user_id: UUID,
    body: RoleRequest,
    admin: CurrentUser = Depends(require_admin),
    container: Container = Depends(get_container),
) -> UserSummary:
    """Wijzigt de rol van een gebruiker."""
    return await container.user_admin.set_role(admin, str(user_id), body)
