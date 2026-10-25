"""Foutklassen en handlers die nooit interne details naar de client lekken."""

import logging

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("app.errors")


class ApiError(Exception):
    """Fout met een HTTP-statuscode en een veilige, generieke boodschap."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
    """Zet een ApiError om naar een JSON-antwoord."""
    return JSONResponse(status_code=exc.status_code, content={"error": exc.message})


async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Geeft alleen veld en melding terug, nooit de ingevoerde waarde."""
    details = [
        {"field": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"error": "Invalid request", "details": details})


async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """Logt alleen het type van de fout en geeft een generiek antwoord."""
    logger.error("Unhandled error of type %s", type(exc).__name__)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})
