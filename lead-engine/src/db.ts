/**
 * db.ts — SQLite storage for sessions, leads and saved searches.
 * One DB file per company_id under ./data/<company_id>.db
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import type { Session, Lead, SavedSearch, SessionFilters } from './types.js';

const DATA_DIR = process.env.DATA_DIR ?? './data';
mkdirSync(DATA_DIR, { recursive: true });

const dbs = new Map<string, Database.Database>();

function db(companyId: string): Database.Database {
  if (dbs.has(companyId)) return dbs.get(companyId)!;
  const instance = new Database(`${DATA_DIR}/${companyId}.db`);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  instance.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id             TEXT PRIMARY KEY,
      company_id     TEXT NOT NULL,
      user_id        TEXT,
      query          TEXT NOT NULL,
      filters        TEXT NOT NULL DEFAULT '{}',
      status         TEXT NOT NULL DEFAULT 'pending',
      progress       INTEGER NOT NULL DEFAULT 0,
      progress_label TEXT,
      results_count  INTEGER NOT NULL DEFAULT 0,
      error_message  TEXT,
      started_at     TEXT,
      completed_at   TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leads (
      id                TEXT PRIMARY KEY,
      session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      company_name      TEXT NOT NULL,
      website           TEXT,
      domain            TEXT,
      email             TEXT,
      email_status      TEXT NOT NULL DEFAULT 'missing',
      validation_status TEXT NOT NULL DEFAULT 'unknown',
      source_page       TEXT,
      phone             TEXT,
      address           TEXT,
      city              TEXT,
      country           TEXT,
      niche             TEXT,
      lead_score        INTEGER NOT NULL DEFAULT 0,
      active_status     TEXT NOT NULL DEFAULT 'uncertain',
      imported          INTEGER NOT NULL DEFAULT 0,
      imported_lead_id  TEXT,
      scraped_at        TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saved_searches (
      id         TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name       TEXT NOT NULL,
      query      TEXT NOT NULL,
      filters    TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);
  dbs.set(companyId, instance);
  return instance;
}

const now = () => new Date().toISOString();

// ── Sessions ──────────────────────────────────────────────────────────────────

export function insertSession(s: Session): void {
  db(s.company_id).prepare(`
    INSERT INTO sessions (id,company_id,user_id,query,filters,status,progress,
      progress_label,results_count,error_message,started_at,completed_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(s.id, s.company_id, s.user_id ?? null, s.query,
    JSON.stringify(s.filters), s.status, s.progress, s.progress_label ?? null,
    s.results_count, s.error_message ?? null, s.started_at ?? null,
    s.completed_at ?? null, s.created_at, s.updated_at);
}

export function patchSession(companyId: string, sessionId: string, patch: Partial<Session>): void {
  const sets = Object.keys(patch).map(k => `${k} = ?`).join(', ');
  const vals = [...Object.values(patch).map(v =>
    typeof v === 'object' ? JSON.stringify(v) : v
  ), now(), sessionId];
  db(companyId).prepare(`UPDATE sessions SET ${sets}, updated_at = ? WHERE id = ?`).run(...vals);
}

export function getSession(companyId: string, sessionId: string): Session | null {
  const row = db(companyId).prepare(
    'SELECT * FROM sessions WHERE id = ? AND company_id = ?'
  ).get(sessionId, companyId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return { ...row, filters: JSON.parse(row.filters as string) } as Session;
}

export function listSessions(companyId: string, page = 1, limit = 20): { sessions: Session[]; total: number } {
  const d = db(companyId);
  const rows = d.prepare(
    'SELECT * FROM sessions WHERE company_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(companyId, limit, (page - 1) * limit) as Record<string, unknown>[];
  const total = (d.prepare('SELECT COUNT(*) as c FROM sessions WHERE company_id = ?').get(companyId) as { c: number }).c;
  return { sessions: rows.map(r => ({ ...r, filters: JSON.parse(r.filters as string) })) as Session[], total };
}

export function deleteSession(companyId: string, sessionId: string): void {
  db(companyId).prepare('DELETE FROM sessions WHERE id = ? AND company_id = ?').run(sessionId, companyId);
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export function insertLeads(companyId: string, leads: Lead[]): void {
  const stmt = db(companyId).prepare(`
    INSERT OR IGNORE INTO leads
    (id,session_id,company_name,website,domain,email,email_status,validation_status,
     source_page,phone,address,city,country,niche,lead_score,active_status,imported,
     imported_lead_id,scraped_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const insert = db(companyId).transaction((ls: Lead[]) => {
    for (const l of ls) {
      stmt.run(l.id, l.session_id, l.company_name, l.website ?? null, l.domain ?? null,
        l.email ?? null, l.email_status, l.validation_status, l.source_page ?? null,
        l.phone ?? null, l.address ?? null, l.city ?? null, l.country ?? null,
        l.niche ?? null, l.lead_score, l.active_status, l.imported ? 1 : 0,
        l.imported_lead_id ?? null, l.scraped_at);
    }
  });
  insert(leads);
}

export function getLeads(companyId: string, sessionId: string): Lead[] {
  return db(companyId).prepare(
    'SELECT * FROM leads WHERE session_id = ? ORDER BY lead_score DESC'
  ).all(sessionId) as Lead[];
}

export function getLeadsByIds(companyId: string, ids: string[]): Lead[] {
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  return db(companyId).prepare(`SELECT * FROM leads WHERE id IN (${ph})`).all(...ids) as Lead[];
}

export function markImported(companyId: string, leadId: string, crmId: string): void {
  db(companyId).prepare(
    'UPDATE leads SET imported = 1, imported_lead_id = ? WHERE id = ?'
  ).run(crmId, leadId);
}

// ── Saved searches ────────────────────────────────────────────────────────────

export function insertSaved(companyId: string, name: string, query: string, filters: Partial<SessionFilters>): SavedSearch {
  const s: SavedSearch = { id: randomUUID(), company_id: companyId, name, query, filters, created_at: now() };
  db(companyId).prepare(
    'INSERT INTO saved_searches (id,company_id,name,query,filters,created_at) VALUES (?,?,?,?,?,?)'
  ).run(s.id, companyId, name, query, JSON.stringify(filters), s.created_at);
  return s;
}

export function listSaved(companyId: string): SavedSearch[] {
  const rows = db(companyId).prepare(
    'SELECT * FROM saved_searches WHERE company_id = ? ORDER BY created_at DESC'
  ).all(companyId) as Record<string, unknown>[];
  return rows.map(r => ({ ...r, filters: JSON.parse(r.filters as string) })) as SavedSearch[];
}

export function deleteSaved(companyId: string, savedId: string): boolean {
  const res = db(companyId).prepare(
    'DELETE FROM saved_searches WHERE id = ? AND company_id = ?'
  ).run(savedId, companyId);
  return res.changes > 0;
}
