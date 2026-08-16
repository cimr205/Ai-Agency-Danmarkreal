import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import encrypt_secret, hash_password
from app.database import get_db
from app.middleware.auth import require_permission, require_platform_admin, require_role
from app.models.tenant import Tenant, TenantUser
from app.models.user import User
from app.core.tenant_context import require_tenant_id

router = APIRouter(prefix="/v1/tenants", tags=["tenants"])


class CreateTenantIn(BaseModel):
    slug: str
    name: str
    plan: str = "starter"


class UpdateCredentialsIn(BaseModel):
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    elevenlabs_api_key: str | None = None
    groq_api_key: str | None = None


class InviteUserIn(BaseModel):
    email: str
    role: str = "agent_user"
    password: str


# ── Platform admin: list / create tenants ────────────────────────────────────

@router.get("", dependencies=[require_platform_admin()])
async def list_tenants(db: AsyncSession = Depends(get_db)):
    tenants = (await db.scalars(select(Tenant).order_by(Tenant.created_at.desc()))).all()
    return {"data": [{"id": str(t.id), "slug": t.slug, "name": t.name,
                      "plan": t.plan, "is_active": t.is_active, "is_suspended": t.is_suspended}
                     for t in tenants]}


@router.post("", dependencies=[require_platform_admin()], status_code=201)
async def create_tenant(body: CreateTenantIn, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(Tenant).where(Tenant.slug == body.slug))
    if existing:
        raise HTTPException(status_code=400, detail="Slug already taken")
    tenant = Tenant(slug=body.slug, name=body.name, plan=body.plan)
    db.add(tenant)
    await db.flush()
    return {"id": str(tenant.id), "slug": tenant.slug}


@router.post("/{tenant_id}/suspend", dependencies=[require_platform_admin()])
async def suspend_tenant(tenant_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(404, "Tenant not found")
    t.is_suspended = True
    return {"ok": True}


# ── Tenant-scoped: current tenant settings ────────────────────────────────────

@router.get("/me", dependencies=[require_role("viewer")])
async def get_current_tenant(db: AsyncSession = Depends(get_db)):
    tenant_id = require_tenant_id()
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(404)
    return {"id": str(t.id), "slug": t.slug, "name": t.name, "plan": t.plan,
            "is_active": t.is_active, "settings": t.settings}


@router.put("/me/credentials", dependencies=[require_role("tenant_owner")])
async def update_credentials(body: UpdateCredentialsIn, db: AsyncSession = Depends(get_db)):
    tenant_id = require_tenant_id()
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(404)
    if body.twilio_account_sid:
        t.twilio_account_sid = body.twilio_account_sid
    if body.twilio_auth_token:
        t.twilio_auth_token_enc = encrypt_secret(body.twilio_auth_token)
    if body.elevenlabs_api_key:
        t.elevenlabs_api_key_enc = encrypt_secret(body.elevenlabs_api_key)
    if body.groq_api_key:
        t.groq_api_key_enc = encrypt_secret(body.groq_api_key)
    return {"ok": True}


@router.post("/me/invite", dependencies=[require_role("tenant_admin")], status_code=201)
async def invite_user(body: InviteUserIn, db: AsyncSession = Depends(get_db)):
    tenant_id = require_tenant_id()
    user = await db.scalar(select(User).where(User.email == body.email))
    if not user:
        user = User(email=body.email, hashed_password=hash_password(body.password))
        db.add(user)
        await db.flush()
    membership = TenantUser(tenant_id=tenant_id, user_id=user.id, role=body.role)
    db.add(membership)
    return {"user_id": str(user.id), "role": body.role}
