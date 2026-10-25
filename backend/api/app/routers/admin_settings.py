"""Beheerders-endpoints voor applicatie-instellingen."""

from fastapi import APIRouter, Depends

from app.admin.retention_service import RetentionRequest, RetentionResponse
from app.container import Container
from app.security.dependencies import get_container, require_admin
from app.security.models import CurrentUser

router = APIRouter(prefix="/api/admin/settings", tags=["admin-settings"])


@router.get("/retention")
async def get_retention(
    _admin: CurrentUser = Depends(require_admin),
    container: Container = Depends(get_container),
) -> RetentionResponse:
    """Geeft de bewaartermijn van berichten."""
    return await container.retention_service.get_days()


@router.put("/retention")
async def put_retention(
    body: RetentionRequest,
    admin: CurrentUser = Depends(require_admin),
    container: Container = Depends(get_container),
) -> RetentionResponse:
    """Stelt de bewaartermijn van berichten in."""
    return await container.retention_service.set_days(admin, body)
