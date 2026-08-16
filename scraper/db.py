"""
db.py — SQLite-backed storage for sessions, results and saved searches.

One DB file per tenant (stored in ./data/<company_id>.db) so tenant isolation
is trivial and no external database is required.

The module uses the standard-library sqlite3 with a thin helper layer.
No ORM, no migrations — just CREATE TABLE IF NOT EXISTS on first use.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, List, Optional

from models import LeadGenResult, LeadGenSavedSearch, LeadGenSession

_DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
_lock = threading.Lock()


# ─────────────────────────────────────────────
# Connection management
# ─────────────────────────────────────────────

def _db_path(company_id: str) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{company_id}.db"


@contextmanager
def _conn(company_id: str) -> Generator[sqlite3.Connection, None, None]:
    path = _db_path(company_id)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ─────────────────────────────────────────────
# Schema bootstrap
# ─────────────────────────────────────────────

_DDL = """
CREATE TABLE IF NOT EXISTS lead_gen_sessions (
    id              TEXT PRIMARY KEY,
    company_id      TEXT NOT NULL,
    user_id         TEXT,
    query           TEXT NOT NULL,
    filters         TEXT NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending',
    progress        INTEGER NOT NULL DEFAULT 0,
    progress_label  TEXT,
    results_count   INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      TEXT,
    completed_at    TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_gen_results (
    id                      TEXT PRIMARY KEY,
    search_session_id       TEXT NOT NULL REFERENCES lead_gen_sessions(id) ON DELETE CASCADE,
    company_name            TEXT NOT NULL,
    website                 TEXT,
    domain                  TEXT,
    business_email          TEXT,
    email_status            TEXT NOT NULL DEFAULT 'missing',
    phone                   TEXT,
    country                 TEXT,
    city                    TEXT,
    region                  TEXT,
    industry                TEXT,
    sub_industry            TEXT,
    description             TEXT,
    employee_estimate       TEXT,
    active_status           TEXT NOT NULL DEFAULT 'uncertain',
    lead_score              INTEGER NOT NULL DEFAULT 0,
    source_url              TEXT,
    contact_page_url        TEXT,
    linkedin_url            TEXT,
    facebook_url            TEXT,
    instagram_url           TEXT,
    owner_name              TEXT,
    decision_maker_name     TEXT,
    decision_maker_role     TEXT,
    notes                   TEXT,
    imported                INTEGER NOT NULL DEFAULT 0,
    imported_lead_id        TEXT,
    created_at              TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_gen_saved (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL,
    name        TEXT NOT NULL,
    query       TEXT NOT NULL,
    filters     TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
);
"""


def ensure_schema(company_id: str) -> None:
    with _conn(company_id) as conn:
        conn.executescript(_DDL)


# ─────────────────────────────────────────────
# Sessions
# ─────────────────────────────────────────────

def _row_to_session(row: sqlite3.Row) -> LeadGenSession:
    d = dict(row)
    d["filters"] = json.loads(d["filters"] or "{}")
    return LeadGenSession(**d)


def insert_session(session: LeadGenSession) -> None:
    ensure_schema(session.company_id)
    with _conn(session.company_id) as conn:
        conn.execute(
            """INSERT INTO lead_gen_sessions
               (id,company_id,user_id,query,filters,status,progress,progress_label,
                results_count,error_message,started_at,completed_at,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                session.id, session.company_id, session.user_id, session.query,
                json.dumps(session.filters), session.status, session.progress,
                session.progress_label, session.results_count, session.error_message,
                session.started_at, session.completed_at, session.created_at, session.updated_at,
            ),
        )


def update_session(company_id: str, session_id: str, **kwargs) -> None:
    """Patch any subset of session fields + always bump updated_at."""
    from datetime import datetime, timezone
    kwargs["updated_at"] = datetime.now(timezone.utc).isoformat()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    vals = list(kwargs.values()) + [session_id]
    with _conn(company_id) as conn:
        conn.execute(f"UPDATE lead_gen_sessions SET {sets} WHERE id = ?", vals)


def get_session(company_id: str, session_id: str) -> Optional[LeadGenSession]:
    ensure_schema(company_id)
    with _conn(company_id) as conn:
        row = conn.execute(
            "SELECT * FROM lead_gen_sessions WHERE id = ? AND company_id = ?",
            (session_id, company_id),
        ).fetchone()
    return _row_to_session(row) if row else None


def list_sessions(company_id: str, page: int = 1, limit: int = 20):
    ensure_schema(company_id)
    offset = (page - 1) * limit
    with _conn(company_id) as conn:
        rows = conn.execute(
            "SELECT * FROM lead_gen_sessions WHERE company_id = ? "
            "ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (company_id, limit, offset),
        ).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) FROM lead_gen_sessions WHERE company_id = ?",
            (company_id,),
        ).fetchone()[0]
    return [_row_to_session(r) for r in rows], total


# ─────────────────────────────────────────────
# Results
# ─────────────────────────────────────────────

def _row_to_result(row: sqlite3.Row) -> LeadGenResult:
    d = dict(row)
    d["imported"] = bool(d["imported"])
    return LeadGenResult(**d)


def insert_results(results: List[LeadGenResult], company_id: str) -> None:
    if not results:
        return
    rows = [
        (
            r.id, r.search_session_id, r.company_name, r.website, r.domain,
            r.business_email, r.email_status, r.phone, r.country, r.city,
            r.region, r.industry, r.sub_industry, r.description, r.employee_estimate,
            r.active_status, r.lead_score, r.source_url, r.contact_page_url,
            r.linkedin_url, r.facebook_url, r.instagram_url, r.owner_name,
            r.decision_maker_name, r.decision_maker_role, r.notes,
            int(r.imported), r.imported_lead_id, r.created_at,
        )
        for r in results
    ]
    with _conn(company_id) as conn:
        conn.executemany(
            """INSERT OR IGNORE INTO lead_gen_results
               (id,search_session_id,company_name,website,domain,business_email,
                email_status,phone,country,city,region,industry,sub_industry,
                description,employee_estimate,active_status,lead_score,source_url,
                contact_page_url,linkedin_url,facebook_url,instagram_url,owner_name,
                decision_maker_name,decision_maker_role,notes,imported,
                imported_lead_id,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            rows,
        )


def get_results(company_id: str, session_id: str) -> List[LeadGenResult]:
    ensure_schema(company_id)
    with _conn(company_id) as conn:
        rows = conn.execute(
            "SELECT * FROM lead_gen_results WHERE search_session_id = ? ORDER BY lead_score DESC",
            (session_id,),
        ).fetchall()
    return [_row_to_result(r) for r in rows]


def get_results_by_ids(company_id: str, result_ids: List[str]) -> List[LeadGenResult]:
    placeholders = ",".join("?" * len(result_ids))
    with _conn(company_id) as conn:
        rows = conn.execute(
            f"SELECT * FROM lead_gen_results WHERE id IN ({placeholders})",
            result_ids,
        ).fetchall()
    return [_row_to_result(r) for r in rows]


def mark_results_imported(company_id: str, result_ids: List[str], lead_ids: List[str]) -> None:
    with _conn(company_id) as conn:
        for result_id, lead_id in zip(result_ids, lead_ids):
            conn.execute(
                "UPDATE lead_gen_results SET imported = 1, imported_lead_id = ? WHERE id = ?",
                (lead_id, result_id),
            )


# ─────────────────────────────────────────────
# Saved searches
# ─────────────────────────────────────────────

def _row_to_saved(row: sqlite3.Row) -> LeadGenSavedSearch:
    d = dict(row)
    d["filters"] = json.loads(d["filters"] or "{}")
    return LeadGenSavedSearch(**d)


def insert_saved(saved: LeadGenSavedSearch) -> None:
    ensure_schema(saved.company_id)
    with _conn(saved.company_id) as conn:
        conn.execute(
            "INSERT INTO lead_gen_saved (id,company_id,name,query,filters,created_at) VALUES (?,?,?,?,?,?)",
            (saved.id, saved.company_id, saved.name, saved.query, json.dumps(saved.filters), saved.created_at),
        )


def list_saved(company_id: str) -> List[LeadGenSavedSearch]:
    ensure_schema(company_id)
    with _conn(company_id) as conn:
        rows = conn.execute(
            "SELECT * FROM lead_gen_saved WHERE company_id = ? ORDER BY created_at DESC",
            (company_id,),
        ).fetchall()
    return [_row_to_saved(r) for r in rows]


def delete_saved(company_id: str, saved_id: str) -> bool:
    with _conn(company_id) as conn:
        cur = conn.execute(
            "DELETE FROM lead_gen_saved WHERE id = ? AND company_id = ?",
            (saved_id, company_id),
        )
    return cur.rowcount > 0
