"""
enricher.py — Visits each business website and extracts emails from:
  - homepage
  - /contact, /contact-us, /kontakt, /about, /about-us, /om-os
  - footer & mailto: links (via DOM scan)

Filters spam/generic addresses and returns the best candidate email per lead.
"""

import asyncio
import logging
import random
import re
from typing import Dict, List, Optional, Set
from urllib.parse import urljoin, urlparse

from playwright.async_api import Page, async_playwright

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Email detection
# ─────────────────────────────────────────────

_EMAIL_RE = re.compile(
    r"[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,255}\.[A-Za-z]{2,}"
)

_SPAM_RE = re.compile(
    r"(no[-_]?reply|donotreply|do[-_]not[-_]reply|noreply"
    r"|example\.|@example\."
    r"|test@|@test\."
    r"|wordpress@|mailchimp@"
    r"|@sentry\.|@amazonaws\.|@cloudflare\.)",
    re.IGNORECASE,
)

# Paths to try in order — stop as soon as we find any email
_CONTACT_PATHS = [
    "/contact",
    "/contact-us",
    "/kontakt",
    "/about",
    "/about-us",
    "/om-os",
    "/impressum",
    "/legal",
]

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _is_valid_email(email: str) -> bool:
    if len(email) > 254:
        return False
    if _SPAM_RE.search(email):
        return False
    local, _, domain = email.rpartition("@")
    if not local or not domain:
        return False
    if "." not in domain:
        return False
    return True


def _extract_emails_from_text(text: str) -> Set[str]:
    found = _EMAIL_RE.findall(text)
    return {e.lower() for e in found if _is_valid_email(e)}


def _score_email(email: str) -> int:
    """
    Lower score = better candidate.
    Prefer info@, hej@, contact@, hello@ over random@subdomain patterns.
    """
    local = email.split("@")[0].lower()
    priority_locals = {"info", "hej", "kontakt", "contact", "hello", "sales", "support", "post"}
    if local in priority_locals:
        return 0
    if any(c.isdigit() for c in local):
        return 2   # e.g. john123@ — lower priority
    return 1


def _best_email(emails: Set[str]) -> Optional[str]:
    if not emails:
        return None
    return sorted(emails, key=_score_email)[0]


async def _safe_goto(page: Page, url: str) -> bool:
    """Navigate to `url`; return True if the page loaded successfully."""
    try:
        response = await page.goto(
            url,
            timeout=14_000,
            wait_until="domcontentloaded",
        )
        if response and response.status >= 400:
            return False
        await asyncio.sleep(random.uniform(0.8, 1.8))
        return True
    except Exception as exc:
        logger.debug(f"goto failed ({url}): {exc}")
        return False


async def _collect_emails_from_page(page: Page) -> Set[str]:
    """Extract emails from the current page DOM + mailto links."""
    emails: Set[str] = set()

    try:
        # Full page text content
        content = await page.content()
        emails |= _extract_emails_from_text(content)

        # Explicit mailto: links
        links = await page.locator('a[href^="mailto:"]').all()
        for link in links:
            href = (await link.get_attribute("href") or "")
            raw = href.replace("mailto:", "").split("?")[0].strip().lower()
            if raw and _is_valid_email(raw):
                emails.add(raw)
    except Exception as exc:
        logger.debug(f"Page email extraction error: {exc}")

    return emails


# ─────────────────────────────────────────────
# Per-lead enrichment
# ─────────────────────────────────────────────

async def _enrich_one(lead: Dict, page: Page) -> Dict:
    website = (lead.get("website") or "").strip()
    if not website:
        return lead

    if not website.startswith("http"):
        website = "https://" + website

    parsed = urlparse(website)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    all_emails: Set[str] = set()

    # 1. Homepage
    if await _safe_goto(page, website):
        all_emails |= await _collect_emails_from_page(page)
        logger.debug(f"  homepage: {all_emails}")

    # 2. Contact / about pages (stop early if we already have something good)
    if not all_emails:
        for path in _CONTACT_PATHS:
            url = base_url + path
            if await _safe_goto(page, url):
                found = await _collect_emails_from_page(page)
                all_emails |= found
                if found:
                    logger.debug(f"  found emails on {path}: {found}")
                    break  # Good enough — move on

    best = _best_email(all_emails)
    if best:
        lead["email"] = best
        logger.info(f"  ✓ email found: {best}")
    else:
        logger.info(f"  – no email found for {lead.get('business_name', website)}")

    return lead


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

async def enrich_leads(leads: List[Dict]) -> List[Dict]:
    """
    Enriches each lead dict in-place with an `email` field.
    Only leads that have a `website` are visited.
    """
    with_website = [l for l in leads if l.get("website")]
    without_website = [l for l in leads if not l.get("website")]
    logger.info(
        f"Enriching {len(with_website)} leads with websites "
        f"({len(without_website)} skipped — no website)"
    )

    enriched: List[Dict] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            viewport={"width": 1366, "height": 900},
        )
        page = await context.new_page()

        for idx, lead in enumerate(with_website):
            logger.info(
                f"[{idx + 1}/{len(with_website)}] Enriching: {lead.get('business_name', '?')} "
                f"→ {lead.get('website', '')}"
            )
            enriched_lead = await _enrich_one(lead, page)
            enriched.append(enriched_lead)

            # Randomised inter-request delay — reduces bot-detection risk
            await asyncio.sleep(random.uniform(1.2, 3.0))

        await browser.close()

    return enriched + without_website
