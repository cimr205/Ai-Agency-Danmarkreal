"""Generates a morning summary of the past 24 hours per tenant."""
import logging
import os
from datetime import datetime, timedelta, timezone
from groq import Groq
from db.queries import fetch_logs_by_tenant, fetch_leads_by_tenant

log = logging.getLogger(__name__)
_groq: Groq | None = None


def _client() -> Groq:
    global _groq
    if _groq is None:
        _groq = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _groq


def generate_morning_summary(tenant: dict) -> str:
    """
    Returns a short Danish morning summary string for the tenant.
    Also suitable to store in agent_logs as daily recap.
    """
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    logs = fetch_logs_by_tenant(tenant["id"], since)
    leads = fetch_leads_by_tenant(tenant["id"])

    qualified = sum(1 for lg in logs if "kvalificeret" in (lg.get("action") or "").lower() or lg.get("action") == "qualification")
    emailed = sum(1 for lg in logs if "email" in (lg.get("action") or "").lower())
    new_leads = sum(1 for ld in leads if ld.get("status") == "new")
    contacted = sum(1 for ld in leads if ld.get("status") == "contacted")

    context = (
        f"Aktivitet de seneste 24 timer for {tenant.get('company_name', 'virksomheden')}:\n"
        f"- Leads vurderet: {qualified}\n"
        f"- Emails sendt: {emailed}\n"
        f"- Leads der afventer kontakt: {new_leads}\n"
        f"- Leads der er kontaktet: {contacted}\n"
        f"- Antal handlinger i alt: {len(logs)}"
    )

    try:
        resp = _client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Du er en salgsassistent. Skriv en kort morgenrapport på dansk "
                        "baseret på den aktivitet der er sket. Vær positiv og konkret. "
                        "Max 100 ord. Ingen emoji."
                    ),
                },
                {"role": "user", "content": context},
            ],
            temperature=0.5,
            max_tokens=200,
        )
        return resp.choices[0].message.content or context
    except Exception as exc:
        log.warning("summary_agent error: %s", exc)
        return context
