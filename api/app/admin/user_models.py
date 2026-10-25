"""Request- en responsemodellen voor gebruikersbeheer."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, StringConstraints, model_validator

from app.security.models import Role

Password = Annotated[str, StringConstraints(min_length=10, max_length=128)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


def validate_role_expiry(role: Role, expires_at: datetime | None) -> datetime | None:
    """Eist een toekomstige einddatum voor gasten en negeert die voor anderen."""
    if role != Role.GUEST:
        return None
    if expires_at is None:
        raise ValueError("expires_at is required for guests")
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        raise ValueError("expires_at must be in the future")
    return expires_at


class CreateUserRequest(BaseModel):
    """Gegevens om een gebruiker aan te maken."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: Password
    display_name: DisplayName | None = None
    role: Role = Role.MEMBER
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def check_expiry(self) -> "CreateUserRequest":
        """Controleert de combinatie van rol en einddatum."""
        self.expires_at = validate_role_expiry(self.role, self.expires_at)
        return self


class InviteUserRequest(BaseModel):
    """Gegevens om een gebruiker uit te nodigen."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    role: Role | None = None


class PasswordRequest(BaseModel):
    """Nieuw wachtwoord voor een gebruiker."""

    model_config = ConfigDict(extra="forbid")

    password: Password


class RoleRequest(BaseModel):
    """Nieuwe rol voor een gebruiker."""

    model_config = ConfigDict(extra="forbid")

    role: Role
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def check_expiry(self) -> "RoleRequest":
        """Controleert de combinatie van rol en einddatum."""
        self.expires_at = validate_role_expiry(self.role, self.expires_at)
        return self


class UserSummary(BaseModel):
    """Samenvatting van een gebruiker uit auth en profiel."""

    id: str
    email: str | None = None
    username: str | None = None
    display_name: str | None = None
    role: str | None = None
    expires_at: str | None = None
    deactivated_at: str | None = None
    last_sign_in_at: str | None = None
    created_at: str | None = None
