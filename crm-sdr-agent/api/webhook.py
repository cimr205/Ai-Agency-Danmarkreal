"""
Webhook endpoints. POST /webhook/new-lead fires immediately on new lead.
Also handles Meta Ads Lead Gen form format.
"""
import logging
import threading
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel

from agents.qualification_agent import qualify_lead
from agents.email_agent import send_email
from config.tenant_loader import get_tenant
from db.queries import insert_lead, update_lead, log_action, insert_task

router = APIRouter(prefix="/webhook", tags=["webhook"])
log = logging.getLogger(__name__)


class NewLeadPayload(BaseModel):
    tenant_id: str
    name: str
    email: str | None = None
    phone: str | None = None
    source: str | None = "webhook"
    company: str | None = None


class MetaLeadPayload(BaseModel):
    """Meta Ads Lead Gen webhook format."""
    entry: list[dict]


def _process_lead_async(lead: dict, tenant: dict) -> None:
    """Run agent logic in background thread so webhook returns immediately."""
    lead_id = lead["id"]
    tenant_id = lead["tenant_id"]
    try:
        result = qualify_lead(lead, tenant)
        score = int(result.get("score", 5))
        reasoning = result.get("reasoning", "")
        action = result.get("action", "")

        log_action(tenant_id, lead_id, "qualification", f"Score {score}/10 — {reasoning}")
        insert_task(tenant_id, lead_id, f"Lead {lead.get('name')}: {action}")

        if score >= 6:
            update_lead(lead_id, {"status": "processing", "score": score, "agent_notes": reasoning})
            ok = send_email(lead, tenant)
            if ok:
                update_lead(lead_id, {"status": "contacted"})
                log_action(tenant_id, lead_id, "email_sent", f"Email sendt til {lead.get('email')}")
                insert_task(tenant_id, lead_id, f"Følg op på {lead.get('name')} — email sendt")
            else:
                update_lead(lead_id, {"status": "email_failed"})
                log_action(tenant_id, lead_id, "email_failed", "Automatisk email fejlede")
                insert_task(tenant_id, lead_id, f"Manuel kontakt til {lead.get('name')} — send fejlede")
        else:
            update_lead(lead_id, {"status": "not_ready", "score": score, "agent_notes": reasoning})
            log_action(tenant_id, lead_id, "not_ready", f"Score {score}/10")
            insert_task(tenant_id, lead_id, f"Genbesøg {lead.get('name')} om 14 dage (score {score}/10)")
    except Exception as exc:
        log.error("Lead processing error for %s: %s", lead_id, exc)
        log_action(tenant_id, lead_id, "error", str(exc))


@router.post("/new-lead")
async def new_lead(payload: NewLeadPayload):
    """
    Receive a new lead and immediately start processing in background.
    Returns 202 Accepted within milliseconds.
    """
    tenant = get_tenant(payload.tenant_id)
    if not tenant:
        raise HTTPException(404, f"Tenant {payload.tenant_id} not found")

    lead = insert_lead(payload.tenant_id, {
        "name": payload.name,
        "email": payload.email,
        "phone": payload.phone,
        "source": payload.source or "webhook",
        "company": payload.company,
    })

    # Fire and forget — agent runs in background
    t = threading.Thread(target=_process_lead_async, args=(lead, tenant), daemon=True)
    t.start()

    return {"status": "accepted", "lead_id": lead["id"], "message": "Agent aktiveret"}


@router.post("/meta-lead")
async def meta_lead(request: Request, x_hub_signature_256: str | None = Header(None)):
    """
    Meta Ads Lead Gen webhook.
    Configure in Meta Business Manager → Lead Ads → CRM Integration → Webhook URL.
    Map Meta field names: full_name → name, email → email, phone_number → phone.
    """
    body = await request.json()

    # Meta sends verification challenge on setup
    if "hub.challenge" in str(await request.body()):
        params = request.query_params
        if params.get("hub.verify_token") == "aiagency_meta_verify":
            return int(params.get("hub.challenge", 0))

    entries = body.get("entry", [])
    processed = 0

    for entry in entries:
        for change in entry.get("changes", []):
            value = change.get("value", {})
            if change.get("field") != "leadgen":
                continue

            # Extract field data from Meta format
            field_data = {f["name"]: f["values"][0] for f in value.get("field_data", []) if f.get("values")}

            # Try to get tenant_id from ad_id or page_id mapping (store in tenant.meta_page_id)
            page_id = value.get("page_id") or entry.get("id") or ""
            # For now: find tenant by matching page_id stored in tenants.meta_page_id
            # Fallback: use first tenant (single-tenant setups)
            from db.supabase_client import get_client
            db = get_client()
            tenant_resp = db.table("tenants").select("id").eq("meta_page_id", page_id).limit(1).execute()
            if not tenant_resp.data:
                tenant_resp = db.table("tenants").select("id").limit(1).execute()

            if not tenant_resp.data:
                log.warning("meta_lead: no tenant for page_id=%s", page_id)
                continue

            tenant_id = tenant_resp.data[0]["id"]
            tenant = get_tenant(tenant_id)
            if not tenant:
                continue

            lead = insert_lead(tenant_id, {
                "name": field_data.get("full_name") or field_data.get("name") or "Meta Lead",
                "email": field_data.get("email") or "",
                "phone": field_data.get("phone_number") or field_data.get("phone") or "",
                "source": "meta_ads",
                "company": field_data.get("company_name") or "",
            })

            t = threading.Thread(target=_process_lead_async, args=(lead, tenant), daemon=True)
            t.start()
            processed += 1

    return {"status": "ok", "processed": processed}


@router.get("/meta-lead")
async def meta_lead_verify(request: Request):
    """Meta webhook verification challenge."""
    params = request.query_params
    if params.get("hub.verify_token") == "aiagency_meta_verify":
        return int(params.get("hub.challenge", 0))
    raise HTTPException(403, "Invalid verify token")
