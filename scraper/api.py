"""
api.py — FastAPI microservice that exposes /v1/lead-gen/ endpoints.

The CRM frontend already calls these exact paths through src/lib/api.ts.
Point VITE_API_BASE_URL (or a reverse-proxy rule) at this server and the
existing LeadGeneration.tsx page works with zero frontend changes.

Authentication:
  Every request must carry the standard Bearer JWT that the CRM issues.
  We decode the company_id and user_id from it without verifying the
  signature (we trust the Railway gateway has already verified it upstream).
  If you need standalone auth, set REQUIRE_AUTH=false in .env to skip checks.

Start:
  uvicorn api:app --host 0.0.0.0 --port 8001 --reload
"""

from __future__ import annotations

import base64
import json
import logging
import os
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import db
import worker
from models import (
    CreateSessionRequest,
    ImportResultsRequest,
    LeadGenFilters,
    LeadGenResult,
    LeadGenSavedSearch,
    LeadGenSession,
    SaveSearchRequest,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "true").lower() != "false"
RAILWAY_API = os.getenv("RAILWAY_API_BASE", "https://api.aiagencydanmark.dk/api")

app = FastAPI(title="Crater CRM — Lead Generation Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# Auth helpers
# ─────────────────────────────────────────────

def _decode_jwt_payload(token: str) -> Dict[str, Any]:
    """Decode the JWT payload WITHOUT verifying the signature."""
    try:
        payload_b64 = token.split(".")[1]
        # Fix base64 padding
        payload_b64 += "=" * (-len(payload_b64) % 4)
        return json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception:
        return {}


def _get_identity(authorization: Optional[str]) -> tuple[str, Optional[str]]:
    """
    Returns (company_id, user_id) from the Bearer token.
    Raises 401 if REQUIRE_AUTH is True and no valid token is present.
    """
    if not REQUIRE_AUTH:
        # Dev mode: use headers or defaults
        return "dev-company", "dev-user"

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = authorization.removeprefix("Bearer ")
    payload = _decode_jwt_payload(token)

    company_id = payload.get("company_id") or payload.get("tenant_id")
    user_id = payload.get("sub") or payload.get("user_id")

    if not company_id:
        raise HTTPException(status_code=401, detail="Token missing company_id")

    return company_id, user_id


# ─────────────────────────────────────────────
# Sessions
# ─────────────────────────────────────────────

@app.post("/v1/lead-gen/sessions")
async def create_session(
    body: CreateSessionRequest,
    authorization: Optional[str] = Header(default=None),
):
    company_id, user_id = _get_identity(authorization)

    session = LeadGenSession(
        company_id=company_id,
        user_id=user_id,
        query=body.query,
        filters=body.filters.model_dump(),
    )
    db.insert_session(session)
    worker.start_job(session, body.filters)

    return {"data": {"session": session.model_dump()}}


@app.get("/v1/lead-gen/sessions")
async def list_sessions(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    authorization: Optional[str] = Header(default=None),
):
    company_id, _ = _get_identity(authorization)
    sessions, total = db.list_sessions(company_id, page=page, limit=limit)
    return {"data": {"sessions": [s.model_dump() for s in sessions], "total": total}}


@app.get("/v1/lead-gen/sessions/{session_id}")
async def get_session(
    session_id: str,
    authorization: Optional[str] = Header(default=None),
):
    company_id, _ = _get_identity(authorization)
    session = db.get_session(company_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    results = db.get_results(company_id, session_id)
    return {
        "data": {
            "session": session.model_dump(),
            "results": [r.model_dump() for r in results],
        }
    }


@app.post("/v1/lead-gen/sessions/{session_id}/cancel")
async def cancel_session(
    session_id: str,
    authorization: Optional[str] = Header(default=None),
):
    company_id, _ = _get_identity(authorization)
    session = db.get_session(company_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail=f"Session is already {session.status}")

    worker.cancel_job(session_id)
    db.update_session(company_id, session_id, status="cancelled")
    return {"ok": True}


@app.delete("/v1/lead-gen/sessions/{session_id}")
async def delete_session(
    session_id: str,
    authorization: Optional[str] = Header(default=None),
):
    company_id, _ = _get_identity(authorization)
    session = db.get_session(company_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if worker.is_running(session_id):
        worker.cancel_job(session_id)
    with db._conn(company_id) as conn:
        conn.execute("DELETE FROM lead_gen_sessions WHERE id = ? AND company_id = ?", (session_id, company_id))
    return {"ok": True}


# ─────────────────────────────────────────────
# Import results → CRM leads
# ─────────────────────────────────────────────

@app.post("/v1/lead-gen/sessions/{session_id}/import")
async def import_results(
    session_id: str,
    body: ImportResultsRequest,
    authorization: Optional[str] = Header(default=None),
):
    company_id, _ = _get_identity(authorization)
    results = db.get_results_by_ids(company_id, body.result_ids)
    if not results:
        raise HTTPException(status_code=404, detail="No results found for the given IDs")

    imported_ids: List[str] = []
    failed_ids: List[str] = []

    async with httpx.AsyncClient(timeout=15) as client:
        for result in results:
            try:
                payload = {
                    "name": result.company_name,
                    "email": result.business_email or "",
                    "phone": result.phone or "",
                    "website": result.website or "",
                    "address": result.city or "",
                    "status": "cold",
                    "source": "lead_gen",
                }
                resp = await client.post(
                    f"{RAILWAY_API}/v1/leads",
                    json=payload,
                    headers={"Authorization": authorization or ""},
                )
                if resp.status_code in (200, 201):
                    data = resp.json()
                    lead_id = (
                        data.get("data", {}).get("lead", {}).get("id")
                        or data.get("id")
                        or result.id
                    )
                    imported_ids.append(result.id)
                    db.mark_results_imported(company_id, [result.id], [lead_id])
                else:
                    logger.warning(f"Import failed for {result.id}: {resp.status_code} {resp.text[:200]}")
                    failed_ids.append(result.id)
            except Exception as exc:
                logger.warning(f"Import error for {result.id}: {exc}")
                failed_ids.append(result.id)

    return {
        "data": {
            "imported": len(imported_ids),
            "failed": failed_ids,
        }
    }


# ─────────────────────────────────────────────
# Saved searches
# ─────────────────────────────────────────────

@app.get("/v1/lead-gen/saved")
async def list_saved(authorization: Optional[str] = Header(default=None)):
    company_id, _ = _get_identity(authorization)
    saved = db.list_saved(company_id)
    return {"data": {"saved": [s.model_dump() for s in saved]}}


@app.post("/v1/lead-gen/saved")
async def create_saved(
    body: SaveSearchRequest,
    authorization: Optional[str] = Header(default=None),
):
    company_id, _ = _get_identity(authorization)
    saved = LeadGenSavedSearch(
        company_id=company_id,
        name=body.name,
        query=body.query,
        filters=body.filters,
    )
    db.insert_saved(saved)
    return {"data": {"saved": saved.model_dump()}}


@app.delete("/v1/lead-gen/saved/{saved_id}")
async def delete_saved(
    saved_id: str,
    authorization: Optional[str] = Header(default=None),
):
    company_id, _ = _get_identity(authorization)
    ok = db.delete_saved(company_id, saved_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Saved search not found")
    return {"ok": True}


# ─────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "lead-gen"}


# ─────────────────────────────────────────────
# Catch-all proxy → Railway backend
# Everything that is NOT /v1/lead-gen/* gets
# forwarded transparently to the real API so
# the CRM can point VITE_API_BASE_URL at this
# service and all other features keep working.
# ─────────────────────────────────────────────

@app.api_route(
    "/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    include_in_schema=False,
)
async def proxy_to_railway(path: str, request: Request):
    url = f"{RAILWAY_API}/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    body = await request.body()
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length")
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(
                method=request.method,
                url=url,
                content=body,
                headers=headers,
            )
        return JSONResponse(
            content=resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {},
            status_code=resp.status_code,
            headers=dict(resp.headers),
        )
    except Exception as exc:
        logger.error(f"Proxy error [{path}]: {exc}")
        raise HTTPException(status_code=502, detail=f"Upstream error: {exc}")
