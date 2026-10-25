"""Endpoint om onderhoudstaken te starten."""

from typing import Any

from fastapi import APIRouter, Depends, Request

from app.container import Container
from app.jobs.job_runner import JobName
from app.security.dependencies import get_container

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("/{name}")
async def run_job(
    name: JobName, request: Request, container: Container = Depends(get_container)
) -> dict[str, Any]:
    """Voert een taak uit voor een admin."""
    actor_id, via = await container.job_auth.authorize(request)
    return await container.job_runner.run(name, actor_id, via)
