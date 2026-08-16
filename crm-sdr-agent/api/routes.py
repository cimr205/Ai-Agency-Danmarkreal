"""REST API routes for agent status, tenant management and morning summaries."""
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config.tenant_loader import get_tenant
from db.queries import (
    fetch_recent_logs, fetch_logs_by_tenant, insert_tenant,
    fetch_leads_by_tenant, fetch_all_tenants,
)
from agents.summary_agent import generate_morning_summary

router = APIRouter(tags=["agent"])
log = logging.getLogger(__name__)


# ── Agent status ──────────────────────────────────────────────────────────────

@router.get("/agent/status")
async def agent_status():
    """Return the last 20 agent actions across all tenants."""
    logs = fetch_recent_logs(20)
    return {"logs": logs, "count": len(logs)}


@router.get("/agent/status/{tenant_id}")
async def agent_status_tenant(tenant_id: str):
    """Return the last 20 agent actions for a specific tenant."""
    since = datetime.now(timezone.utc) - timedelta(days=7)
    logs = fetch_logs_by_tenant(tenant_id, since)
    return {"tenant_id": tenant_id, "logs": logs[:20], "count": len(logs)}


# ── Morning summary ───────────────────────────────────────────────────────────

@router.get("/tenant/{tenant_id}/summary")
async def tenant_summary(tenant_id: str):
    """Generate and return a fresh morning summary for the tenant."""
    tenant = get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(404, f"Tenant {tenant_id} not found")
    summary = generate_morning_summary(tenant)
    leads = fetch_leads_by_tenant(tenant_id)
    return {
        "tenant_id": tenant_id,
        "company_name": tenant.get("company_name"),
        "summary": summary,
        "lead_counts": {
            "new": sum(1 for l in leads if l["status"] == "new"),
            "contacted": sum(1 for l in leads if l["status"] == "contacted"),
            "not_ready": sum(1 for l in leads if l["status"] == "not_ready"),
            "total": len(leads),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ── Tenant management ─────────────────────────────────────────────────────────

class TenantCreate(BaseModel):
    company_name: str
    tone_of_voice: str = "professionel og venlig"
    product_description: str
    calendly_link: str = ""
    smtp_user: str = ""
    smtp_password: str = ""
    meta_page_id: str = ""


@router.post("/tenant/create", status_code=201)
async def create_tenant(payload: TenantCreate):
    """Create a new tenant (company) in the system."""
    tenant = insert_tenant(payload.model_dump())
    return {"status": "created", "tenant": tenant}


@router.get("/tenant/{tenant_id}")
async def get_tenant_info(tenant_id: str):
    tenant = get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(404, f"Tenant {tenant_id} not found")
    # Never expose smtp_password
    safe = {k: v for k, v in tenant.items() if k != "smtp_password"}
    return safe


@router.get("/tenants")
async def list_tenants():
    tenants = fetch_all_tenants()
    safe = [{k: v for k, v in t.items() if k != "smtp_password"} for t in tenants]
    return {"tenants": safe, "count": len(safe)}


# ── Leads overview ────────────────────────────────────────────────────────────

@router.get("/tenant/{tenant_id}/leads")
async def tenant_leads(tenant_id: str, status: str | None = None):
    tenant = get_tenant(tenant_id)
    if not tenant:
        raise HTTPException(404, f"Tenant {tenant_id} not found")
    leads = fetch_leads_by_tenant(tenant_id)
    if status:
        leads = [l for l in leads if l.get("status") == status]
    return {"leads": leads, "count": len(leads)}


# ── Health check ──────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "ok", "service": "crm-sdr-agent", "time": datetime.now(timezone.utc).isoformat()}
