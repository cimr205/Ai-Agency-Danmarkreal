"""Scores an incoming lead 1-10 using Groq. Returns JSON with score, reasoning, action."""
import json
import os
import logging
from groq import Groq

log = logging.getLogger(__name__)
_groq: Groq | None = None


def _client() -> Groq:
    global _groq
    if _groq is None:
        _groq = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _groq


SYSTEM = """Du er en erfaren B2B salgskonsulent med 15 års erfaring.
Vurder det indkomne lead og giv en score fra 1 til 10.

Faktorer der øger scoren:
- Lead har virksomheds-email (ikke gmail/hotmail)
- Lead kommer fra Meta Ads eller specifik kampagne
- Lead har angivet telefonnummer
- Lead arbejder i et relevant segment

Faktorer der sænker scoren:
- Mangler email eller telefon
- Generisk kilde (unknown, direct)
- Intet firmanavn

Svar KUN med JSON (ingen tekst udenfor JSON):
{
  "score": <heltal 1-10>,
  "reasoning": "<kort dansk begrundelse>",
  "action": "<anbefalet næste skridt på dansk>"
}"""


def qualify_lead(lead: dict, tenant: dict) -> dict:
    """
    Returns dict: { score: int, reasoning: str, action: str }
    Falls back to score=5 on any error.
    """
    product = tenant.get("product_description", "B2B software")
    user_msg = (
        f"Lead: {lead.get('name', '?')}\n"
        f"Email: {lead.get('email', 'ikke angivet')}\n"
        f"Telefon: {lead.get('phone', 'ikke angivet')}\n"
        f"Kilde: {lead.get('source', 'unknown')}\n"
        f"Firma: {lead.get('company', 'ikke angivet')}\n"
        f"Sælger for: {tenant.get('company_name', '?')}\n"
        f"Produkt: {product}"
    )

    try:
        chat = _client().chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=300,
        )
        raw = chat.choices[0].message.content or ""
        # Strip markdown code fences if present
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        return json.loads(raw)
    except Exception as exc:
        log.warning("qualification_agent error: %s", exc)
        return {"score": 5, "reasoning": "Kunne ikke vurdere lead automatisk.", "action": "Manuel gennemgang anbefales."}
