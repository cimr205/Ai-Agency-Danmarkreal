"""
FastAPI dependency factories for auth + RBAC.
Use these as Depends() in route functions.
"""

from uuid import UUID
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import decode_token, role_has_permission, role_gte
from app.database import get_db
from app.models.tenant import TenantUser
from app.models.user import User
from app.core.tenant_context import get_tenant_id

bearer_scheme = HTTPBearer(auto_error=False)


async def _get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(credentials.credentials)
        user_id = UUID(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or not found")
    return user


async def _get_tenant_membership(
    user: User = Depends(_get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TenantUser | None:
    tenant_id = get_tenant_id()
    if not tenant_id or user.is_platform_admin:
        return None
    row = await db.scalar(
        select(TenantUser).where(
            TenantUser.tenant_id == tenant_id,
            TenantUser.user_id == user.id,
            TenantUser.is_active == True,
        )
    )
    return row


# ── Public dependency factories ────────────────────────────────────────────────

def require_auth():
    """Require any authenticated user."""
    return Depends(_get_current_user)


def require_permission(permission: str):
    async def _check(
        user: User = Depends(_get_current_user),
        membership: TenantUser | None = Depends(_get_tenant_membership),
    ) -> User:
        if user.is_platform_admin:
            return user
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tenant membership")
        if not role_has_permission(membership.role, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {permission}")
        return user
    return Depends(_check)


def require_role(minimum_role: str):
    async def _check(
        user: User = Depends(_get_current_user),
        membership: TenantUser | None = Depends(_get_tenant_membership),
    ) -> User:
        if user.is_platform_admin:
            return user
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tenant membership")
        if not role_gte(membership.role, minimum_role):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Requires role: {minimum_role}")
        return user
    return Depends(_check)


def require_platform_admin():
    async def _check(user: User = Depends(_get_current_user)) -> User:
        if not user.is_platform_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin required")
        return user
    return Depends(_check)
