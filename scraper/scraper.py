"""
scraper.py — Google Maps scraper using Playwright (no API key required)
Extracts business_name, phone, website, address, rating for each result.
"""

import asyncio
import logging
import random
from typing import Dict, List

from playwright.async_api import Page, async_playwright

logger = logging.getLogger(__name__)

DELAYS = {
    "scroll": (1.2, 2.8),
    "click": (1.5, 3.0),
    "page_load": (2.5, 4.5),
}

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

async def _random_delay(key: str) -> None:
    lo, hi = DELAYS[key]
    await asyncio.sleep(random.uniform(lo, hi))


async def _dismiss_consent(page: Page) -> None:
    """Click "Accept all" / GDPR cookie consent if it appears."""
    for label in ["Accept all", "Alle akzeptieren", "Accepter tout"]:
        try:
            btn = page.locator(f'button:has-text("{label}")').first
            if await btn.count():
                await btn.click()
                await asyncio.sleep(1.5)
                return
        except Exception:
            pass


async def _scroll_results_panel(page: Page, target: int) -> int:
    """
    Scroll the left results panel until we have >= target items
    or no new results appear after 5 consecutive scrolls.
    Returns the final count of visible result items.
    """
    feed = '[role="feed"]'
    try:
        await page.wait_for_selector(feed, timeout=12_000)
    except Exception:
        logger.warning("Results feed not found – wrong page?")
        return 0

    prev_count = 0
    stale_streak = 0

    while True:
        count = await page.locator(f'{feed} > div').count()
        logger.info(f"  Panel items loaded: {count}")

        if count >= target:
            break

        if count == prev_count:
            stale_streak += 1
            if stale_streak >= 5:
                logger.info("  No more results loading (end of list).")
                break
        else:
            stale_streak = 0

        prev_count = count

        # Check for "end of list" marker
        end_marker = page.locator('span:has-text("You\'ve reached the end")')
        if await end_marker.count():
            logger.info("  Reached end-of-list marker.")
            break

        await page.evaluate(
            "document.querySelector('[role=\"feed\"]').scrollTop += 1200"
        )
        await _random_delay("scroll")

    return await page.locator(f'{feed} > div').count()


async def _extract_details(page: Page) -> Dict:
    """
    Parse the currently-open business detail pane.
    Returns a dict with all fields (empty strings for missing values).
    """
    data: Dict = {
        "business_name": "",
        "phone": "",
        "website": "",
        "address": "",
        "rating": "",
        "email": "",
    }

    try:
        # ── Name ──────────────────────────────────────────────────────────
        h1 = page.locator("h1").first
        if await h1.count():
            data["business_name"] = (await h1.text_content() or "").strip()

        # ── Rating ────────────────────────────────────────────────────────
        for sel in [
            'span[aria-hidden="true"][role="img"]',
            '.F7nice span[aria-hidden]',
        ]:
            el = page.locator(sel).first
            if await el.count():
                text = (await el.text_content() or "").strip()
                if text and text[0].isdigit():
                    data["rating"] = text
                    break

        # ── Address ───────────────────────────────────────────────────────
        for sel in [
            'button[data-item-id="address"]',
            '[data-item-id*="address"]',
            'button[aria-label*="ddress"]',
        ]:
            el = page.locator(sel).first
            if await el.count():
                data["address"] = (await el.text_content() or "").strip()
                break

        # ── Phone ─────────────────────────────────────────────────────────
        for sel in [
            'button[data-tooltip="Copy phone number"]',
            'button[aria-label*="phone"]',
            '[data-item-id*="phone"]',
        ]:
            el = page.locator(sel).first
            if await el.count():
                data["phone"] = (await el.text_content() or "").strip()
                break

        # ── Website ───────────────────────────────────────────────────────
        for sel in [
            'a[data-item-id="authority"]',
            'a[aria-label*="website"]',
            'a[href^="http"][data-item-id]',
        ]:
            el = page.locator(sel).first
            if await el.count():
                href = (await el.get_attribute("href") or "").strip()
                if href.startswith("http"):
                    data["website"] = href
                    break

    except Exception as exc:
        logger.debug(f"Detail extraction error: {exc}")

    return data


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

async def scrape_google_maps(query: str, min_leads: int) -> List[Dict]:
    """
    Scrape Google Maps for `query`, aiming for at least `min_leads` results.
    Returns a list of business dicts (email field left empty for enricher).
    """
    leads: List[Dict] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
            ],
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

        # Mask automation flag
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )

        page = await context.new_page()

        url = "https://www.google.com/maps/search/" + query.replace(" ", "+")
        logger.info(f"Opening: {url}")
        await page.goto(url, wait_until="networkidle", timeout=30_000)
        await _random_delay("page_load")

        await _dismiss_consent(page)

        # Scroll until we have enough entries
        total_in_panel = await _scroll_results_panel(page, min_leads)
        logger.info(f"Panel loaded {total_in_panel} items — extracting details…")

        # Collect all clickable result cards
        items = await page.locator('[role="feed"] > div').all()

        for idx, item in enumerate(items):
            try:
                logger.info(f"  [{idx + 1}/{len(items)}] clicking card…")
                await item.scroll_into_view_if_needed()
                await item.click()
                await page.wait_for_timeout(random.randint(1800, 3000))

                details = await _extract_details(page)

                if details["business_name"]:
                    leads.append(details)
                    logger.info(f"  ✓ {details['business_name']}")
                else:
                    logger.debug("  Skipped (no name)")

                await _random_delay("click")

            except Exception as exc:
                logger.warning(f"  Card {idx + 1} failed: {exc}")
                continue

        await browser.close()

    logger.info(f"scraper done — {len(leads)} raw leads collected")
    return leads
