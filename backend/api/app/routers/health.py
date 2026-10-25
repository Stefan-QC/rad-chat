"""Health-endpoint zonder authenticatie."""

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Meldt dat de API draait."""
    return {"status": "ok"}
