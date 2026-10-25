"""Applicatiefabriek: middleware, routers en levenscyclus."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.container import Container
from app.errors import (
    ApiError,
    handle_api_error,
    handle_unexpected_error,
    handle_validation_error,
)
from app.routers import admin_users, gifs, health
from app.security.middleware import BodySizeLimitMiddleware, SecurityHeadersMiddleware


def configure_logging() -> None:
    """Voorkomt dat httpx URL's met geheimen op INFO-niveau logt."""
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def add_security_middleware(app: FastAPI, settings: Settings) -> None:
    """Registreert body-limiet, beveiligingsheaders en de CORS-allowlist."""
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Job-Token"],
        max_age=600,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Sluit bij het afsluiten de resources van de container."""
    container: Container = app.state.container
    try:
        yield
    finally:
        await container.aclose()


def create_app(settings: Settings | None = None, container: Container | None = None) -> FastAPI:
    """Bouwt de FastAPI-applicatie."""
    configure_logging()
    settings = settings or get_settings()
    app = FastAPI(
        title="RAD Chat API",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.container = container or Container(settings)
    add_security_middleware(app, settings)
    app.add_exception_handler(ApiError, handle_api_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(Exception, handle_unexpected_error)
    app.include_router(health.router)
    app.include_router(gifs.router)
    app.include_router(admin_users.router)
    return app
