"""
models.py — Pydantic models that exactly mirror the TypeScript interfaces in
src/lib/api.ts (LeadGenSession, LeadGenResult, LeadGenSavedSearch).

These are the wire types returned by every /v1/lead-gen/ endpoint so the
existing CRM frontend works without any frontend changes.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


# ─────────────────────────────────────────────
# Session
# ─────────────────────────────────────────────

SessionStatus = Literal["pending", "running", "done", "failed", "cancelled"]


class LeadGenFilters(BaseModel):
    country: Optional[str] = None
    city: Optional[str] = None
    industry: Optional[str] = None
    industry_keywords: Optional[List[str]] = None
    employee_size: Optional[str] = None
    must_have_email: bool = False
    must_have_phone: bool = False
    must_have_website: bool = False
    must_be_active: bool = False
    keywords: Optional[str] = None
    exclude_keywords: Optional[str] = None
    score_threshold: Optional[int] = None
    min_leads: int = 20


class LeadGenSession(BaseModel):
    id: str = Field(default_factory=_uuid)
    company_id: str
    user_id: Optional[str] = None
    query: str
    filters: Dict[str, Any] = Field(default_factory=dict)
    status: SessionStatus = "pending"
    progress: int = 0
    progress_label: Optional[str] = None
    results_count: int = 0
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


# ─────────────────────────────────────────────
# Result
# ─────────────────────────────────────────────

EmailStatus = Literal["verified", "likely_valid", "unverified", "missing"]
ActiveStatus = Literal["active_likely", "uncertain", "inactive_likely"]


class LeadGenResult(BaseModel):
    id: str = Field(default_factory=_uuid)
    search_session_id: str
    company_name: str
    website: Optional[str] = None
    domain: Optional[str] = None
    business_email: Optional[str] = None
    email_status: EmailStatus = "missing"
    phone: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    industry: Optional[str] = None
    sub_industry: Optional[str] = None
    description: Optional[str] = None
    employee_estimate: Optional[str] = None
    active_status: ActiveStatus = "uncertain"
    lead_score: int = 0
    source_url: Optional[str] = None
    contact_page_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    facebook_url: Optional[str] = None
    instagram_url: Optional[str] = None
    owner_name: Optional[str] = None
    decision_maker_name: Optional[str] = None
    decision_maker_role: Optional[str] = None
    notes: Optional[str] = None
    imported: bool = False
    imported_lead_id: Optional[str] = None
    created_at: str = Field(default_factory=_now)

    @classmethod
    def from_scrape(cls, raw: dict, session_id: str) -> "LeadGenResult":
        """Convert a raw dict from the scraper/enricher into a LeadGenResult."""
        from urllib.parse import urlparse

        email = (raw.get("email") or "").strip().lower() or None
        website = (raw.get("website") or "").strip() or None
        domain = None
        if website:
            try:
                domain = urlparse(website).netloc.lstrip("www.")
            except Exception:
                pass

        # Derive email_status
        if email:
            email_status: EmailStatus = "likely_valid"
        else:
            email_status = "missing"

        # Simple lead score:  +2 email, +1 phone, +1 website, +1 address
        score = 0
        if email:
            score += 2
        if raw.get("phone"):
            score += 1
        if website:
            score += 1
        if raw.get("address"):
            score += 1

        # Try to extract city from address
        city = None
        address = (raw.get("address") or "").strip()
        if address:
            parts = [p.strip() for p in address.split(",")]
            if len(parts) >= 2:
                city = parts[-2]

        return cls(
            search_session_id=session_id,
            company_name=(raw.get("business_name") or "").strip(),
            website=website,
            domain=domain,
            business_email=email,
            email_status=email_status,
            phone=(raw.get("phone") or "").strip() or None,
            city=city,
            active_status="active_likely" if website else "uncertain",
            lead_score=score,
            notes=(
                f"Rating: {raw['rating']}" if raw.get("rating") else None
            ),
        )


# ─────────────────────────────────────────────
# Saved search
# ─────────────────────────────────────────────

class LeadGenSavedSearch(BaseModel):
    id: str = Field(default_factory=_uuid)
    company_id: str
    name: str
    query: str
    filters: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=_now)


# ─────────────────────────────────────────────
# Request bodies
# ─────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    query: str
    filters: LeadGenFilters = Field(default_factory=LeadGenFilters)


class ImportResultsRequest(BaseModel):
    result_ids: List[str]


class SaveSearchRequest(BaseModel):
    name: str
    query: str
    filters: Dict[str, Any] = Field(default_factory=dict)
