"""Gebruikersbeheer voor beheerders: aanmaken, uitnodigen, (de)activeren en rollen."""

from datetime import UTC, datetime
from typing import Any

from app.admin.audit_service import AuditService
from app.admin.user_models import (
    CreateUserRequest,
    InviteUserRequest,
    RoleRequest,
    UserSummary,
)
from app.clients.supabase_auth_admin import SupabaseAuthAdmin
from app.clients.supabase_rest import SupabaseRest
from app.errors import ApiError
from app.security.models import CurrentUser, Role
from app.security.token_verifier import PROFILE_FIELDS

BAN_FOREVER = "876000h"


class UserAdminService:
    """Voert beheerdersacties op gebruikers uit en legt ze vast in het audit-log."""

    def __init__(self, auth_admin: SupabaseAuthAdmin, rest: SupabaseRest, audit: AuditService) -> None:
        self._auth = auth_admin
        self._rest = rest
        self._audit = audit

    @staticmethod
    def _summary(auth_user: dict[str, Any], profile: dict[str, Any] | None) -> UserSummary:
        """Voegt de gegevens van auth en profiel samen."""
        profile = profile or {}
        return UserSummary(
            id=str(auth_user.get("id")),
            email=auth_user.get("email"),
            username=profile.get("username"),
            display_name=profile.get("display_name"),
            role=profile.get("role"),
            expires_at=profile.get("expires_at"),
            deactivated_at=profile.get("deactivated_at"),
            last_sign_in_at=auth_user.get("last_sign_in_at"),
            created_at=auth_user.get("created_at"),
        )

    @staticmethod
    def _guard_self(actor: CurrentUser, user_id: str, message: str) -> None:
        """Voorkomt dat een beheerder zichzelf treft."""
        if str(actor.id) == user_id:
            raise ApiError(400, message)

    async def _profiles_by_id(self, ids: list[str]) -> dict[str, dict[str, Any]]:
        """Laadt de profielen van de opgegeven gebruikers."""
        if not ids:
            return {}
        rows = await self._rest.select(
            "profiles", {"id": f"in.({','.join(ids)})", "select": PROFILE_FIELDS}
        )
        return {str(row["id"]): row for row in rows}

    async def _patch_profile(self, user_id: str, values: dict[str, Any]) -> dict[str, Any]:
        """Wijzigt het profiel en geeft het nieuwe profiel terug."""
        rows = await self._rest.update("profiles", {"id": f"eq.{user_id}"}, values)
        if not rows:
            raise ApiError(404, "Profile not found")
        return rows[0]

    async def _updated_summary(self, user_id: str, profile: dict[str, Any]) -> UserSummary:
        """Bouwt een samenvatting na een wijziging."""
        return self._summary(await self._auth.get_user(user_id), profile)

    async def list_users(self, page: int, per_page: int) -> list[UserSummary]:
        """Geeft één pagina met gebruikers inclusief profielgegevens."""
        users = await self._auth.list_users(page, per_page)
        profiles = await self._profiles_by_id([str(user["id"]) for user in users])
        return [self._summary(user, profiles.get(str(user["id"]))) for user in users]

    async def create_user(self, actor: CurrentUser, request: CreateUserRequest) -> UserSummary:
        """Maakt een gebruiker aan en stelt rol en einddatum in op het profiel."""
        created = await self._auth.create_user(request.email, request.password, request.display_name)
        user_id = str(created["id"])
        values: dict[str, Any] = {
            "role": request.role.value,
            "expires_at": request.expires_at.isoformat() if request.expires_at else None,
        }
        if request.display_name:
            values["display_name"] = request.display_name
        try:
            profile = await self._patch_profile(user_id, values)
        except ApiError:
            raise ApiError(502, "User created but the profile could not be updated") from None
        await self._audit.record(
            str(actor.id),
            "admin.user.create",
            "user",
            user_id,
            {"email": request.email, "role": request.role.value, "expires_at": values["expires_at"]},
        )
        return self._summary(created, profile)

    async def invite(self, actor: CurrentUser, request: InviteUserRequest) -> dict[str, Any]:
        """Stuurt een uitnodiging per e-mail."""
        role = request.role.value if request.role else None
        invited = await self._auth.invite(request.email, role)
        await self._audit.record(
            str(actor.id), "admin.user.invite", "user", str(invited.get("id")), {"email": request.email, "role": role}
        )
        return {"id": str(invited.get("id")), "email": request.email}

    async def deactivate(self, actor: CurrentUser, user_id: str) -> UserSummary:
        """Blokkeert de gebruiker in auth en markeert het profiel als gedeactiveerd."""
        self._guard_self(actor, user_id, "You cannot deactivate yourself")
        await self._auth.update_user(user_id, {"ban_duration": BAN_FOREVER})
        profile = await self._patch_profile(user_id, {"deactivated_at": datetime.now(UTC).isoformat()})
        await self._audit.record(str(actor.id), "admin.user.deactivate", "user", user_id)
        return await self._updated_summary(user_id, profile)

    async def reactivate(self, actor: CurrentUser, user_id: str) -> UserSummary:
        """Heft de blokkade op en wist de deactivatiedatum."""
        self._guard_self(actor, user_id, "You cannot reactivate yourself")
        await self._auth.update_user(user_id, {"ban_duration": "none"})
        profile = await self._patch_profile(user_id, {"deactivated_at": None})
        await self._audit.record(str(actor.id), "admin.user.reactivate", "user", user_id)
        return await self._updated_summary(user_id, profile)

    async def set_password(self, actor: CurrentUser, user_id: str, password: str) -> dict[str, str]:
        """Zet een nieuw wachtwoord; het wachtwoord komt nooit in het audit-log."""
        await self._auth.update_user(user_id, {"password": password})
        await self._audit.record(str(actor.id), "admin.user.password", "user", user_id)
        return {"status": "ok"}

    async def set_role(self, actor: CurrentUser, user_id: str, request: RoleRequest) -> UserSummary:
        """Wijzigt de rol en einddatum; een beheerder kan zichzelf niet degraderen."""
        if str(actor.id) == user_id and request.role != Role.ADMIN:
            raise ApiError(400, "You cannot demote yourself")
        values = {
            "role": request.role.value,
            "expires_at": request.expires_at.isoformat() if request.expires_at else None,
        }
        profile = await self._patch_profile(user_id, values)
        await self._audit.record(str(actor.id), "admin.user.role", "user", user_id, values)
        return await self._updated_summary(user_id, profile)
