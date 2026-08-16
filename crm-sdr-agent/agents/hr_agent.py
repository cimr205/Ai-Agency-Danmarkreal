"""Sends welcome emails and creates onboarding tasks for new employees."""
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from groq import Groq
from db.queries import fetch_new_employees, log_action, insert_task

log = logging.getLogger(__name__)
_groq: Groq | None = None

ONBOARDING_TASKS = [
    "Send velkomstpakke og adgangskoder til {name}",
    "Book introduktionsmøde med {name} inden for de første 3 dage",
    "Opsæt arbejdsmail og systemer for {name}",
    "Gennemfør GDPR-onboarding med {name}",
    "Planlæg 30-dages opfølgning med {name}",
]


def _client() -> Groq:
    global _groq
    if _groq is None:
        _groq = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _groq


def _generate_welcome(employee: dict, company_name: str) -> str:
    name = employee.get("full_name") or employee.get("name") or "dig"
    prompt = (
        f"Skriv en kort velkomstemail på dansk til {name}, der er startet i {company_name}.\n"
        f"Varm og professionel tone. Max 100 ord. "
        f"Nævn at de vil høre mere om praktiske detaljer inden for kort tid. Ingen emoji."
    )
    try:
        resp = _client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
            max_tokens=200,
        )
        return resp.choices[0].message.content or ""
    except Exception as exc:
        log.warning("hr_agent generate error: %s", exc)
        return (
            f"Hej {name},\n\n"
            f"Velkommen til {company_name}! Vi er glade for at have dig med på holdet. "
            f"Du vil høre fra os snart med praktiske detaljer om din start.\n\n"
            f"Med venlig hilsen\n{company_name}"
        )


def _send(to_email: str, subject: str, body: str) -> bool:
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
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
        log.error("hr_agent SMTP error: %s", exc)
        return False


def run_hr_onboarding() -> None:
    """Check for new employees and send welcome emails + create onboarding tasks."""
    employees = fetch_new_employees(minutes=5)
    log.info("hr_agent: %d new employees found", len(employees))

    for emp in employees:
        company = emp.get("companies") or {}
        company_name = company.get("company_name") or "AI Agency Danmark"
        tenant_id = company.get("id") or ""
        name = emp.get("full_name") or emp.get("name") or "Ny medarbejder"
        email = emp.get("email") or ""

        if email:
            body = _generate_welcome(emp, company_name)
            ok = _send(email, f"Velkommen til {company_name}!", body)
            log_action(tenant_id, None, "hr_welcome_email", f"Velkomstmail til {name} ({email}): {'sendt' if ok else 'fejlede'}")

        # Create onboarding tasks
        for task_tpl in ONBOARDING_TASKS:
            insert_task(tenant_id, None, task_tpl.format(name=name))

        log_action(tenant_id, None, "hr_onboarding_tasks", f"5 onboarding-opgaver oprettet for {name}")
        log.info("hr_agent: processed employee %s", name)
