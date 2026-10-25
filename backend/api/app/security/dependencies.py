"""FastAPI-dependencies voor authenticatie en autorisatie."""

from fastapi import Depends, Request

from app.container import Container
from app.errors import ApiError
from app.security.bearer import extract_bearer
from app.security.models import CurrentUser


def get_container(request: Request) -> Container:
    """Geeft de container van de applicatie terug."""
    return request.app.state.container


async def current_user(
    request: Request, container: Container = Depends(get_container)
) -> CurrentUser:
    """Verifieert het token en past de rate limit per gebruiker toe."""
    user = await container.verifier.verify(extract_bearer(request))
    container.rate_limiter.check(str(user.id))
    return user


async def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    """Staat alleen beheerders toe."""
    if not user.is_admin:
        raise ApiError(403, "Admin role required")
    return user
