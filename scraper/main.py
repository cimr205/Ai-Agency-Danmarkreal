"""
main.py — Production runner for the B2B lead generation pipeline.

Usage:
    python main.py "<search_query>" <min_leads> [--output leads.json]

Examples:
    python main.py "window cleaners in Copenhagen" 50
    python main.py "rengøringsfirmaer i Aarhus" 30 --output aarhus_leads.json
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path
from typing import Dict, List

from enricher import enrich_leads
from scraper import scrape_google_maps

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# Data processing
# ─────────────────────────────────────────────

def deduplicate(leads: List[Dict]) -> List[Dict]:
    """Remove duplicate leads by name and phone number."""
    seen_names: set = set()
    seen_phones: set = set()
    unique: List[Dict] = []

    for lead in leads:
        name_key = (lead.get("business_name") or "").lower().strip()
        phone = (lead.get("phone") or "").strip()

        if not name_key:
            continue
        if name_key in seen_names:
            continue
        if phone and phone in seen_phones:
            continue

        seen_names.add(name_key)
        if phone:
            seen_phones.add(phone)
        unique.append(lead)

    return unique


def sort_by_quality(leads: List[Dict]) -> List[Dict]:
    """Sort leads: emails first, then by whether they have a phone number."""
    def _score(lead: Dict) -> int:
        score = 0
        if lead.get("email"):
            score += 2
        if lead.get("phone"):
            score += 1
        return score

    return sorted(leads, key=_score, reverse=True)


def clean_lead(lead: Dict) -> Dict:
    """Normalise whitespace and strip junk characters."""
    return {
        "business_name": (lead.get("business_name") or "").strip(),
        "phone": (lead.get("phone") or "").strip(),
        "email": (lead.get("email") or "").strip().lower(),
        "website": (lead.get("website") or "").strip(),
        "address": (lead.get("address") or "").strip(),
    }


# ─────────────────────────────────────────────
# Interactive prompts
# ─────────────────────────────────────────────

def _ask_continue_or_similar(found: int, requested: int) -> str:
    """
    When fewer leads than requested are found, ask the user what to do.
    Returns 'continue', 'similar', or 'abort'.
    """
    print(
        f"\n⚠️  Only {found} unique leads found — you requested {requested}.\n"
        "Options:\n"
        "  [1] continue  — use what we have\n"
        "  [2] similar   — provide a related search query to top up\n"
        "  [3] abort     — exit without saving\n"
    )
    choice = input("Your choice (1/2/3): ").strip()
    mapping = {"1": "continue", "2": "similar", "3": "abort", "continue": "continue", "similar": "similar", "abort": "abort"}
    return mapping.get(choice, "abort")


# ─────────────────────────────────────────────
# Pipeline
# ─────────────────────────────────────────────

async def run_pipeline(query: str, min_leads: int) -> List[Dict]:
    """Full pipeline: scrape → dedup → (optional top-up) → enrich → sort → clean."""

    # ── Step 1: Scrape ────────────────────────────────────────────────────
    logger.info(f"▶ Step 1 — Scraping Google Maps: '{query}'  (target: {min_leads})")
    raw = await scrape_google_maps(query, min_leads)
    logger.info(f"  Raw results: {len(raw)}")

    # ── Step 2: Deduplicate ───────────────────────────────────────────────
    unique = deduplicate(raw)
    logger.info(f"  After dedup: {len(unique)}")

    # ── Step 3: Check count — ask user if short ───────────────────────────
    if len(unique) < min_leads:
        action = _ask_continue_or_similar(len(unique), min_leads)

        if action == "abort":
            logger.info("Aborted by user.")
            sys.exit(0)

        elif action == "similar":
            print("Enter a similar/related search query:")
            extra_query = input("> ").strip()
            if extra_query:
                needed = min_leads - len(unique)
                logger.info(f"▶ Step 1b — Extra scrape: '{extra_query}'  (target: {needed})")
                extra_raw = await scrape_google_maps(extra_query, needed)
                combined = deduplicate(unique + extra_raw)
                logger.info(f"  Combined after extra scrape: {len(combined)}")
                unique = combined

        # action == "continue": proceed with what we have

    # ── Step 4: Enrich with emails ────────────────────────────────────────
    logger.info(f"▶ Step 2 — Enriching {len(unique)} leads with email addresses…")
    enriched = await enrich_leads(unique)

    # ── Step 5: Final clean + sort ────────────────────────────────────────
    final = sort_by_quality([clean_lead(l) for l in enriched])

    with_email = sum(1 for l in final if l["email"])
    with_phone = sum(1 for l in final if l["phone"])
    logger.info(
        f"▶ Done — {len(final)} leads  |  {with_email} with email  |  {with_phone} with phone"
    )

    return final


# ─────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="B2B lead generator — scrapes Google Maps and enriches with emails"
    )
    parser.add_argument("query", help='Search query, e.g. "window cleaners in Copenhagen"')
    parser.add_argument("min_leads", type=int, help="Minimum number of leads to collect")
    parser.add_argument(
        "--output",
        default=None,
        help="Output JSON file path (default: auto-generated from query)",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    leads = asyncio.run(run_pipeline(args.query, args.min_leads))

    # Determine output filename
    if args.output:
        out_path = Path(args.output)
    else:
        safe_name = args.query[:40].lower().replace(" ", "_").replace("/", "-")
        out_path = Path(f"leads_{safe_name}.json")

    # Write JSON
    json_str = json.dumps(leads, ensure_ascii=False, indent=2)
    out_path.write_text(json_str, encoding="utf-8")

    # Also print to stdout so the caller can pipe the output
    print(json_str)

    logger.info(f"Saved → {out_path.resolve()}")


if __name__ == "__main__":
    main()
