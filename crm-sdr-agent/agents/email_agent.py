"""Generates and sends a personalized Danish outreach email via SMTP."""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from groq import Groq

log = logging.getLogger(__name__)
_groq: Groq | None = None


def _client() -> Groq:
    global _groq
    if _groq is None:
        _groq = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _groq


def _generate_email_body(lead: dict, tenant: dict) -> str:
    system = (
        f"Du er sælger for {tenant.get('company_name', 'virksomheden')}. "
        f"Skriv en kort, varm og personlig email på dansk. "
        f"Tone of voice: {tenant.get('tone_of_voice', 'professionel og venlig')}. "
        f"Max 150 ord. "
        f"Inkluder en naturlig opfordring til at booke et 20-minutters møde via: {tenant.get('calendly_link', '')}. "
        f"Produkt/service: {tenant.get('product_description', 'B2B software')}. "
        f"Lyd som et rigtigt menneske — ikke en bot. Ingen emoji. Ingen bullet points. "
        f"Underskriv med dit navn: 'AI Agency Danmark Team'."
    )
    user = (
        f"Skriv en velkomst-email til {lead.get('name', 'dig')} "
        f"der kom ind via {lead.get('source', 'vores hjemmeside')}."
    )

    try:
        resp = _client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.7,
            max_tokens=400,
        )
        return resp.choices[0].message.content or ""
    except Exception as exc:
        log.warning("email_agent generate error: %s", exc)
        calendly = tenant.get("calendly_link", "")
        name = lead.get("name", "dig")
        company = tenant.get("company_name", "os")
        return (
            f"Hej {name},\n\n"
            f"Tak fordi du henvendte dig til {company}. "
            f"Vi vil meget gerne høre mere om dine behov og se om vi kan hjælpe dig.\n\n"
            f"Book et kortere møde her, så finder vi ud af det: {calendly}\n\n"
            f"Med venlig hilsen\n{company}"
        )


def send_email(lead: dict, tenant: dict) -> bool:
    """
    Sends email to lead. Uses tenant SMTP credentials if available,
    otherwise falls back to global SMTP env vars.
    Returns True on success.
    """
    to_email = lead.get("email")
    if not to_email:
        log.warning("send_email: no email on lead %s", lead.get("id"))
        return False

    smtp_user = tenant.get("smtp_user") or os.environ.get("SMTP_USER", "")
    smtp_password = tenant.get("smtp_password") or os.environ.get("SMTP_PASSWORD", "")
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))

    if not smtp_user or not smtp_password:
        log.error("send_email: missing SMTP credentials for tenant %s", tenant.get("id"))
        return False

    body = _generate_email_body(lead, tenant)
    subject = f"Hej {lead.get('name', '')} — tak for din henvendelse"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_email

    # Plain text part
    msg.attach(MIMEText(body, "plain", "utf-8"))

    # HTML part (simple wrapping)
    html_body = body.replace("\n", "<br>")
    html = f"<html><body style='font-family:sans-serif;font-size:15px;color:#222;max-width:560px'>{html_body}</body></html>"
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, [to_email], msg.as_string())
        log.info("Email sent to %s", to_email)
        return True
    except Exception as exc:
        log.error("send_email SMTP error: %s", exc)
        return False
