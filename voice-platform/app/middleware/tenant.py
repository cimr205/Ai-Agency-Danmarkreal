"""
Tenant resolution middleware.

Resolves the current tenant from (in priority order):
  1. JWT claim  →  token.company_id / token.tenant_id
  2. API key    →  X-API-Key header → api_keys table
  3. Subdomain  →  {slug}.aiagency.dk → tenants.slug
  4. Phone map  →  X-Twilio-To header → phone_numbers table (for webhooks)

Sets tenant_id in contextvars so every downstream handler can call
`require_tenant_id()` without touching the request object.
"""

import hashlib
from uuid import UUID

from fastapi import Request
from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.core.security import decode_token
from app.core.tenant_context import set_tenant
from app.database import AsyncSessionLocal
from app.models.tenant import ApiKey, Tenant
from app.models.voice_agent import PhoneNumber
from app.redis_client import get_redis

# Paths that never need a tenant (auth, health, docs)
_SKIP_PATHS = {"/health", "/docs", "/openapi.json", "/redoc", "/v1/auth/register", "/v1/auth/login"}


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in _SKIP_PATHS or request.url.path.startswith("/v1/platform"):
            return await call_next(request)

        tenant_id = await self._resolve(request)
        if tenant_id:
            set_tenant(tenant_id)

        return await call_next(request)

    async def _resolve(self, request: Request) -> UUID | None:
        # 1. JWT
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            try:
                payload = decode_token(auth[7:])
                raw = payload.get("tenant_id") or payload.get("company_id")
                if raw:
                    return UUID(str(raw))
            except Exception:
                pass

        # 2. API key
        api_key = request.headers.get("X-API-Key", "")
        if api_key:
            key_hash = hashlib.sha256(api_key.encode()).hexdigest()
            redis = get_redis()
            cached = await redis.get(f"apikey:{key_hash}")
            if cached:
                return UUID(cached)

            async with AsyncSessionLocal() as db:
                row = await db.scalar(
                    select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True)
                )
                if row:
                    await redis.setex(f"apikey:{key_hash}", 300, str(row.tenant_id))
                    return row.tenant_id

        # 3. Subdomain
        host = request.headers.get("host", "").split(":")[0]
        base = settings.base_domain
        if host.endswith(f".{base}"):
            slug = host[: -(len(base) + 1)]
            redis = get_redis()
            cached = await redis.get(f"slug:{slug}")
            if cached:
                return UUID(cached)
            async with AsyncSessionLocal() as db:
                tenant = await db.scalar(
                    select(Tenant).where(Tenant.slug == slug, Tenant.is_active == True)
                )
                if tenant:
                    await redis.setex(f"slug:{slug}", 300, str(tenant.id))
                    return tenant.id

        # 4. Phone number (Twilio webhooks send To/From headers)
        to_number = request.headers.get("X-Twilio-To") or (await _form_field(request, "To"))
        if to_number:
            async with AsyncSessionLocal() as db:
                phone = await db.scalar(
                    select(PhoneNumber).where(PhoneNumber.number == to_number, PhoneNumber.is_active == True)
                )
                if phone:
                    return phone.tenant_id

        return None


async def _form_field(request: Request, field: str) -> str | None:
    """Safely peek at a form field without consuming the body."""
    ct = request.headers.get("content-type", "")
    if "application/x-www-form-urlencoded" in ct or "multipart/form-data" in ct:
        try:
            form = await request.form()
            return form.get(field)
        except Exception:
            pass
    return None
