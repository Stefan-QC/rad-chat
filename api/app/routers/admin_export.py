"""Beheerders-endpoint voor het exporteren van berichten."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.admin.export_service import ExportFormat
from app.container import Container
from app.security.dependencies import get_container, require_admin
from app.security.models import CurrentUser

router = APIRouter(prefix="/api/admin", tags=["admin-export"])


@router.get("/export")
async def export_messages(
    channel_id: UUID | None = None,
    since: datetime | None = None,
    format: ExportFormat = "json",
    admin: CurrentUser = Depends(require_admin),
    container: Container = Depends(get_container),
) -> StreamingResponse:
    """Exporteert berichten als download."""
    result = await container.export_service.export(admin, channel_id, since, format)
    return StreamingResponse(
        result.body,
        media_type=result.media_type,
        headers={"Content-Disposition": f'attachment; filename="{result.filename}"'},
    )
