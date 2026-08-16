"""All database queries. Every query is scoped to tenant_id — never mix tenant data."""
from datetime import datetime, timedelta, timezone
from typing import Any
from db.supabase_client import get_client


# ── Leads ────────────────────────────────────────────────────────────────────

def fetch_new_leads() -> list[dict]:
    """Fetch all leads with status='new' across all tenants."""
    db = get_client()
    resp = db.table("leads").select("*").eq("status", "new").execute()
    return resp.data or []


def update_lead(lead_id: str, data: dict) -> None:
    db = get_client()
    db.table("leads").update(data).eq("id", lead_id).execute()


def insert_lead(tenant_id: str, payload: dict) -> dict:
    db = get_client()
    row = {"tenant_id": tenant_id, **payload, "status": "new"}
    resp = db.table("leads").insert(row).execute()
    return resp.data[0]


def fetch_leads_by_tenant(tenant_id: str) -> list[dict]:
    db = get_client()
    resp = db.table("leads").select("*").eq("tenant_id", tenant_id).execute()
    return resp.data or []


# ── Tasks ────────────────────────────────────────────────────────────────────

def insert_task(tenant_id: str, lead_id: str | None, description: str) -> None:
    db = get_client()
    db.table("tasks").insert({
        "tenant_id": tenant_id,
        "lead_id": lead_id,
        "description": description,
        "completed": False,
    }).execute()


# ── Agent logs ───────────────────────────────────────────────────────────────

def log_action(tenant_id: str, lead_id: str | None, action: str, result: str) -> None:
    db = get_client()
    db.table("agent_logs").insert({
        "tenant_id": tenant_id,
        "lead_id": lead_id,
        "action": action,
        "result": result,
    }).execute()


def fetch_recent_logs(limit: int = 20) -> list[dict]:
    db = get_client()
    resp = (
        db.table("agent_logs")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return resp.data or []


def fetch_logs_by_tenant(tenant_id: str, since: datetime) -> list[dict]:
    db = get_client()
    resp = (
        db.table("agent_logs")
        .select("*")
        .eq("tenant_id", tenant_id)
        .gte("created_at", since.isoformat())
        .order("created_at", desc=True)
        .execute()
    )
    return resp.data or []


# ── Tenants ──────────────────────────────────────────────────────────────────

def fetch_tenant(tenant_id: str) -> dict | None:
    db = get_client()
    resp = db.table("tenants").select("*").eq("id", tenant_id).single().execute()
    return resp.data


def fetch_all_tenants() -> list[dict]:
    db = get_client()
    resp = db.table("tenants").select("*").execute()
    return resp.data or []


def insert_tenant(payload: dict) -> dict:
    db = get_client()
    resp = db.table("tenants").insert(payload).execute()
    return resp.data[0]


# ── Invoices ─────────────────────────────────────────────────────────────────

def fetch_invoices_due_soon(days: int = 3) -> list[dict]:
    """Invoices due within `days` days that are not yet paid."""
    db = get_client()
    now = datetime.now(timezone.utc)
    cutoff = (now + timedelta(days=days)).date().isoformat()
    resp = (
        db.table("invoices")
        .select("*, tenants(company_name, tone_of_voice, smtp_user, smtp_password, calendly_link)")
        .lte("due_date", cutoff)
        .gte("due_date", now.date().isoformat())
        .not_.in_("status", ["PAID", "paid", "CANCELLED", "cancelled"])
        .execute()
    )
    return resp.data or []


# ── Employees (new entries in last N minutes) ─────────────────────────────────

def fetch_new_employees(minutes: int = 5) -> list[dict]:
    db = get_client()
    since = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    resp = (
        db.table("profiles")
        .select("*, companies(company_name, id)")
        .gte("created_at", since)
        .execute()
    )
    return resp.data or []
