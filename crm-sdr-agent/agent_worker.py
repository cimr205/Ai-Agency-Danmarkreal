"""
Background worker process. Run with: python agent_worker.py
Uses APScheduler:
  - Every 30 seconds: process new leads
  - Every hour:       invoice reminders
  - Every 5 minutes:  HR onboarding check
  - Daily at 08:00 CPH: morning summary per tenant
"""
import logging
import os
import time
from datetime import datetime

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from pytz import timezone as tz

from agents.qualification_agent import qualify_lead
from agents.email_agent import send_email
from agents.summary_agent import generate_morning_summary
from agents.invoice_agent import run_invoice_reminders
from agents.hr_agent import run_hr_onboarding
from config.tenant_loader import get_tenant, get_all_tenants
from db.queries import fetch_new_leads, update_lead, log_action, insert_task, fetch_recent_logs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("worker")

COPENHAGEN = tz("Europe/Copenhagen")


# ── Lead processing ───────────────────────────────────────────────────────────

def process_new_leads() -> None:
    leads = fetch_new_leads()
    if not leads:
        return
    log.info("Processing %d new lead(s)", len(leads))

    for lead in leads:
        tenant_id = lead.get("tenant_id") or ""
        lead_id = lead.get("id") or ""

        tenant = get_tenant(tenant_id)
        if not tenant:
            log.warning("No tenant found for id=%s — skipping lead %s", tenant_id, lead_id)
            update_lead(lead_id, {"status": "no_tenant"})
            continue

        # 1. Qualify
        result = qualify_lead(lead, tenant)
        score = int(result.get("score", 5))
        reasoning = result.get("reasoning", "")
        action = result.get("action", "")

        log_action(tenant_id, lead_id, "qualification", f"Score {score}/10 — {reasoning}")
        insert_task(tenant_id, lead_id, f"Lead {lead.get('name')}: {action}")

        # 2. Branch on score
        if score >= 6:
            update_lead(lead_id, {"status": "processing", "score": score, "agent_notes": reasoning})
            ok = send_email(lead, tenant)
            if ok:
                update_lead(lead_id, {"status": "contacted"})
                log_action(tenant_id, lead_id, "email_sent", f"Velkomstmail sendt til {lead.get('email')}")
                insert_task(tenant_id, lead_id, f"Følg op på {lead.get('name')} — email sendt, afventer svar")
            else:
                update_lead(lead_id, {"status": "email_failed"})
                log_action(tenant_id, lead_id, "email_failed", f"Kunne ikke sende email til {lead.get('email')}")
                insert_task(tenant_id, lead_id, f"Manuel email til {lead.get('name')} ({lead.get('email')}) — automatisk send fejlede")
        else:
            update_lead(lead_id, {"status": "not_ready", "score": score, "agent_notes": reasoning})
            log_action(tenant_id, lead_id, "not_ready", f"Score {score}/10 — markeret som ikke klar")
            insert_task(tenant_id, lead_id, f"Genbesøg lead {lead.get('name')} om 14 dage — score {score}/10")


# ── Morning summary ───────────────────────────────────────────────────────────

def run_morning_summaries() -> None:
    tenants = get_all_tenants()
    log.info("Generating morning summaries for %d tenant(s)", len(tenants))
    for tenant in tenants:
        try:
            summary = generate_morning_summary(tenant)
            log_action(tenant["id"], None, "morning_summary", summary)
            log.info("Morning summary for %s: %s", tenant.get("company_name"), summary[:80])
        except Exception as exc:
            log.error("Morning summary failed for %s: %s", tenant.get("id"), exc)


# ── Main scheduler ────────────────────────────────────────────────────────────

def main() -> None:
    log.info("SDR Agent worker starting up...")

    # Startup check
    try:
        logs = fetch_recent_logs(1)
        log.info("DB connection OK. Last log: %s", logs[0].get("action") if logs else "none")
    except Exception as exc:
        log.error("DB connection failed: %s", exc)

    scheduler = BlockingScheduler(timezone=COPENHAGEN)

    # Every 30 seconds: process new leads
    scheduler.add_job(process_new_leads, "interval", seconds=30, id="lead_processor",
                      max_instances=1, coalesce=True)

    # Every hour: invoice reminders
    scheduler.add_job(run_invoice_reminders, "interval", hours=1, id="invoice_reminders",
                      max_instances=1, coalesce=True)

    # Every 5 minutes: HR onboarding check
    scheduler.add_job(run_hr_onboarding, "interval", minutes=5, id="hr_onboarding",
                      max_instances=1, coalesce=True)

    # Daily at 08:00 Copenhagen time: morning summaries
    scheduler.add_job(
        run_morning_summaries,
        CronTrigger(hour=8, minute=0, timezone=COPENHAGEN),
        id="morning_summary",
        max_instances=1,
    )

    log.info("Scheduler started. Jobs: %s", [j.id for j in scheduler.get_jobs()])

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("Worker shutting down.")


if __name__ == "__main__":
    main()
