"""
worker.py — Background job executor.

Each scrape job runs in its own thread so the FastAPI server stays responsive.
Progress is written to the DB in real-time so the frontend polling loop sees it.

Flow:
  1. Set session status → running
  2. Google Maps scrape (updates progress 0–50)
  3. Email enrichment   (updates progress 50–90)
  4. Persist results    (updates progress 90–100)
  5. Set status → done | failed
"""

from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime, timezone
from typing import Dict, List

import db
from enricher import enrich_leads
from models import LeadGenFilters, LeadGenResult, LeadGenSession
from scraper import scrape_google_maps

logger = logging.getLogger(__name__)

# session_id → threading.Event  (set to cancel a running job)
_cancel_flags: Dict[str, threading.Event] = {}
_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _set_progress(session: LeadGenSession, pct: int, label: str) -> None:
    db.update_session(
        session.company_id,
        session.id,
        progress=pct,
        progress_label=label,
    )


def _build_query(query: str, filters: LeadGenFilters) -> str:
    """
    Append city/country to the raw query string so the Maps search is
    as specific as possible.
    """
    parts = [query]
    if filters.city:
        parts.append(f"in {filters.city}")
    if filters.country:
        parts.append(filters.country)
    return " ".join(parts)


def _apply_filters(results: List[dict], filters: LeadGenFilters) -> List[dict]:
    out = []
    for r in results:
        if filters.must_have_email and not r.get("email"):
            continue
        if filters.must_have_phone and not r.get("phone"):
            continue
        if filters.must_have_website and not r.get("website"):
            continue
        if filters.exclude_keywords:
            name_lower = (r.get("business_name") or "").lower()
            if any(kw.lower() in name_lower for kw in filters.exclude_keywords.split(",")):
                continue
        out.append(r)
    return out


# ─────────────────────────────────────────────
# Core job
# ─────────────────────────────────────────────

def _run_job(session: LeadGenSession, filters: LeadGenFilters) -> None:
    cancel = _cancel_flags.get(session.id, threading.Event())
    company_id = session.company_id

    try:
        # ── Mark running ──────────────────────────────────────────────────
        db.update_session(
            company_id, session.id,
            status="running",
            started_at=_now(),
            progress=0,
            progress_label="Starting Google Maps scrape…",
        )

        min_leads = filters.min_leads or 20
        full_query = _build_query(session.query, filters)

        # ── Step 1: Scrape Google Maps (0 → 50 %) ─────────────────────────
        _set_progress(session, 5, f'Searching Google Maps for "{full_query}"…')

        if cancel.is_set():
            raise InterruptedError("Cancelled before scrape")

        raw_leads = asyncio.run(scrape_google_maps(full_query, min_leads))
        logger.info(f"[{session.id}] scraped {len(raw_leads)} raw leads")

        if cancel.is_set():
            raise InterruptedError("Cancelled after scrape")

        _set_progress(session, 50, f"Scraped {len(raw_leads)} businesses. Enriching emails…")

        # ── Step 2: Apply filters ─────────────────────────────────────────
        filtered = _apply_filters(raw_leads, filters)

        # ── Step 3: Email enrichment (50 → 90 %) ──────────────────────────
        total = len(filtered)
        enriched: List[dict] = []

        # Run enrichment in batches so we can update progress + check cancel
        batch_size = max(1, total // 8)  # ~8 progress steps
        for i in range(0, total, batch_size):
            if cancel.is_set():
                raise InterruptedError("Cancelled during enrichment")
            batch = filtered[i : i + batch_size]
            done_batch = asyncio.run(enrich_leads(batch))
            enriched.extend(done_batch)
            pct = 50 + int(len(enriched) / max(total, 1) * 40)
            _set_progress(session, pct, f"Enriched {len(enriched)}/{total} businesses…")

        _set_progress(session, 90, "Saving results…")

        # ── Step 4: Convert + persist ──────────────────────────────────────
        results = [
            LeadGenResult.from_scrape(r, session.id)
            for r in enriched
            if (r.get("business_name") or "").strip()
        ]

        # Apply score_threshold filter
        if filters.score_threshold:
            results = [r for r in results if r.lead_score >= filters.score_threshold]

        db.insert_results(results, company_id)
        db.update_session(
            company_id, session.id,
            status="done",
            progress=100,
            progress_label=f"Complete — {len(results)} leads found",
            results_count=len(results),
            completed_at=_now(),
        )
        logger.info(f"[{session.id}] done — {len(results)} leads saved")

    except InterruptedError as e:
        db.update_session(
            company_id, session.id,
            status="cancelled",
            progress_label=str(e),
            completed_at=_now(),
        )
        logger.info(f"[{session.id}] cancelled")

    except Exception as exc:
        logger.exception(f"[{session.id}] job failed")
        db.update_session(
            company_id, session.id,
            status="failed",
            error_message=str(exc),
            completed_at=_now(),
        )

    finally:
        with _lock:
            _cancel_flags.pop(session.id, None)


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

def start_job(session: LeadGenSession, filters: LeadGenFilters) -> None:
    """Spawn a background thread for the given session."""
    cancel_event = threading.Event()
    with _lock:
        _cancel_flags[session.id] = cancel_event

    t = threading.Thread(
        target=_run_job,
        args=(session, filters),
        name=f"scrape-{session.id[:8]}",
        daemon=True,
    )
    t.start()
    logger.info(f"Started job thread for session {session.id}")


def cancel_job(session_id: str) -> bool:
    """Signal a running job to stop. Returns True if the job was found."""
    with _lock:
        event = _cancel_flags.get(session_id)
    if event:
        event.set()
        return True
    return False


def is_running(session_id: str) -> bool:
    with _lock:
        return session_id in _cancel_flags
