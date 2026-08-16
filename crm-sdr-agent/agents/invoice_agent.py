"""Sends a friendly Danish payment reminder for invoices due in ≤3 days."""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from groq import Groq
from db.queries import fetch_invoices_due_soon, log_action, insert_task

log = logging.getLogger(__name__)
_groq: Groq | None = None


def _client() -> Groq:
    global _groq
    if _groq is None:
        _groq = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _groq


def _generate_reminder(invoice: dict, tenant_name: str) -> str:
    inv_num = invoice.get("invoice_number") or invoice.get("id", "?")
    amount = invoice.get("total") or invoice.get("amount", "?")
    due = invoice.get("due_date", "snart")
    customer = (invoice.get("customer") or {}).get("name") or "kunden"

    prompt = (
        f"Skriv en kort, venlig betalingspåmindelse på dansk til {customer}.\n"
        f"Faktura #{inv_num} på {amount} kr. forfalder {due}.\n"
        f"Fra: {tenant_name}.\n"
        f"Max 80 ord. Professionel tone. Ingen truende sprogbrug. Ingen emoji."
    )
    try:
        resp = _client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=200,
        )
        return resp.choices[0].message.content or ""
    except Exception as exc:
        log.warning("invoice_agent generate error: %s", exc)
        return (
            f"Hej {customer},\n\n"
            f"Dette er en venlig påmindelse om faktura #{inv_num} på {amount} kr., "
            f"der forfalder {due}.\n\n"
            f"Med venlig hilsen\n{tenant_name}"
        )


def _send(to_email: str, subject: str, body: str, tenant: dict) -> bool:
    smtp_user = tenant.get("smtp_user") or os.environ.get("SMTP_USER", "")
    smtp_password = tenant.get("smtp_password") or os.environ.get("SMTP_PASSWORD", "")
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))

    if not smtp_user or not smtp_password:
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as s:
            s.ehlo(); s.starttls(); s.login(smtp_user, smtp_password)
            s.sendmail(smtp_user, [to_email], msg.as_string())
        return True
    except Exception as exc:
        log.error("invoice reminder SMTP error: %s", exc)
        return False


def run_invoice_reminders() -> None:
    """Check all invoices due in the next 3 days and send reminders."""
    invoices = fetch_invoices_due_soon(days=3)
    log.info("invoice_agent: %d invoices due soon", len(invoices))

    for inv in invoices:
        tenant_data = inv.get("tenants") or {}
        tenant_id = inv.get("tenant_id") or ""
        tenant_name = tenant_data.get("company_name") or "AI Agency Danmark"

        customer = inv.get("customer") or {}
        to_email = (customer.get("email") or "").strip()
        if not to_email:
            log.debug("invoice_agent: no customer email for invoice %s", inv.get("id"))
            continue

        body = _generate_reminder(inv, tenant_name)
        inv_num = inv.get("invoice_number") or inv.get("id", "?")
        subject = f"Påmindelse: Faktura #{inv_num} forfalder snart"

        ok = _send(to_email, subject, body, tenant_data)
        status = "sendt" if ok else "fejlede"

        log_action(tenant_id, None, "invoice_reminder", f"Faktura #{inv_num} → {to_email}: {status}")
        insert_task(tenant_id, None, f"Opfølg på faktura #{inv_num} til {to_email} — påmindelse {status}")
        log.info("invoice_agent: reminder for %s → %s", inv_num, status)
