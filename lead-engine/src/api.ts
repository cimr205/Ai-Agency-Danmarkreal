/**
 * api.ts — Express REST server.
 *
 * Exposes the exact /v1/lead-gen/* endpoints the CRM frontend calls.
 * Any request that is NOT a lead-gen path is proxied transparently to
 * the Railway backend so this service can be used as the sole API target.
 *
 * Start: node --loader tsx/esm src/api.ts   (or: npm run dev)
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import * as db from './db.js';
import { runPipeline } from './pipeline.js';
import type { Session, SessionFilters } from './types.js';

const PORT         = Number(process.env.PORT ?? 8001);
const RAILWAY_API  = process.env.RAILWAY_API_BASE ?? 'https://api.aiagencydanmark.dk/api';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false';

const app = express();
app.use(cors());
app.use(express.json());

// ── Auth helper ───────────────────────────────────────────────────────────────

function identity(req: Request): { companyId: string; userId: string } {
  if (!REQUIRE_AUTH) return { companyId: 'dev', userId: 'dev' };

  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  try {
    const b64 = auth.slice(7).split('.')[1];
    const payload = JSON.parse(Buffer.from(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '='), 'base64url').toString());
    const companyId = payload.company_id ?? payload.tenant_id ?? '';
    if (!companyId) throw new Error('missing company_id');
    return { companyId, userId: payload.sub ?? payload.user_id ?? '' };
  } catch {
    throw Object.assign(new Error('Invalid token'), { status: 401 });
  }
}

// ── Active jobs ───────────────────────────────────────────────────────────────

const running = new Map<string, { cancel: () => void }>();

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /v1/lead-gen/sessions — create + start a job
app.post('/v1/lead-gen/sessions', async (req, res, next) => {
  try {
    const { companyId, userId } = identity(req);
    const { query, filters = {} } = req.body as { query: string; filters: Partial<SessionFilters> };
    if (!query) return res.status(400).json({ error: 'query is required' });

    const sessionId = randomUUID();
    const now       = new Date().toISOString();
    const session: Session = {
      id: sessionId, company_id: companyId, user_id: userId,
      query, filters: { min_leads: 20, ...filters } as SessionFilters,
      status: 'pending', progress: 0, progress_label: 'Queued',
      results_count: 0, error_message: '', started_at: '', completed_at: '',
      created_at: now, updated_at: now,
    };
    db.insertSession(session);

    // Run in background
    let cancelled = false;
    running.set(sessionId, { cancel: () => { cancelled = true; } });

    (async () => {
      try {
        db.patchSession(companyId, sessionId, { status: 'running', started_at: new Date().toISOString() });

        const leads = await runPipeline(
          sessionId, query, session.filters,
          async (pct, label) => {
            if (cancelled) throw new Error('Cancelled');
            db.patchSession(companyId, sessionId, { progress: pct, progress_label: label });
          },
        );

        db.insertLeads(companyId, leads);
        db.patchSession(companyId, sessionId, {
          status: 'done', progress: 100,
          progress_label: `Complete — ${leads.length} leads`,
          results_count: leads.length,
          completed_at: new Date().toISOString(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        db.patchSession(companyId, sessionId, {
          status: msg === 'Cancelled' ? 'cancelled' : 'failed',
          error_message: msg,
          completed_at: new Date().toISOString(),
        });
      } finally {
        running.delete(sessionId);
      }
    })();

    return res.json({ data: { session: db.getSession(companyId, sessionId) } });
  } catch (e) { next(e); }
});

// GET /v1/lead-gen/sessions
app.get('/v1/lead-gen/sessions', (req, res, next) => {
  try {
    const { companyId } = identity(req);
    const page  = Number(req.query.page  ?? 1);
    const limit = Number(req.query.limit ?? 20);
    res.json({ data: db.listSessions(companyId, page, limit) });
  } catch (e) { next(e); }
});

// GET /v1/lead-gen/sessions/:id
app.get('/v1/lead-gen/sessions/:id', (req, res, next) => {
  try {
    const { companyId } = identity(req);
    const session = db.getSession(companyId, req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found' });
    const results = db.getLeads(companyId, req.params.id);
    res.json({ data: { session, results } });
  } catch (e) { next(e); }
});

// POST /v1/lead-gen/sessions/:id/cancel
app.post('/v1/lead-gen/sessions/:id/cancel', (req, res, next) => {
  try {
    const { companyId } = identity(req);
    running.get(req.params.id)?.cancel();
    db.patchSession(companyId, req.params.id, { status: 'cancelled' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /v1/lead-gen/sessions/:id
app.delete('/v1/lead-gen/sessions/:id', (req, res, next) => {
  try {
    const { companyId } = identity(req);
    running.get(req.params.id)?.cancel();
    db.deleteSession(companyId, req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /v1/lead-gen/sessions/:id/import
app.post('/v1/lead-gen/sessions/:id/import', async (req, res, next) => {
  try {
    const { companyId } = identity(req);
    const { result_ids } = req.body as { result_ids: string[] };
    const leads = db.getLeadsByIds(companyId, result_ids);

    let imported = 0;
    const failed: string[] = [];

    for (const lead of leads) {
      try {
        const resp = await fetch(`${RAILWAY_API}/v1/leads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: req.headers.authorization ?? '',
          },
          body: JSON.stringify({
            name: lead.company_name, email: lead.email ?? '',
            phone: lead.phone ?? '', website: lead.website ?? '',
            address: lead.city ?? lead.address ?? '',
            status: 'cold', source: 'lead_gen',
          }),
        });
        if (resp.ok) {
          const body = await resp.json() as { data?: { lead?: { id: string } }; id?: string };
          const crmId = body?.data?.lead?.id ?? body?.id ?? lead.id;
          db.markImported(companyId, lead.id, crmId);
          imported++;
        } else { failed.push(lead.id); }
      } catch { failed.push(lead.id); }
    }

    res.json({ data: { imported, failed } });
  } catch (e) { next(e); }
});

// GET /v1/lead-gen/saved
app.get('/v1/lead-gen/saved', (req, res, next) => {
  try {
    const { companyId } = identity(req);
    res.json({ data: { saved: db.listSaved(companyId) } });
  } catch (e) { next(e); }
});

// POST /v1/lead-gen/saved
app.post('/v1/lead-gen/saved', (req, res, next) => {
  try {
    const { companyId } = identity(req);
    const { name, query, filters } = req.body;
    const saved = db.insertSaved(companyId, name, query, filters ?? {});
    res.json({ data: { saved } });
  } catch (e) { next(e); }
});

// DELETE /v1/lead-gen/saved/:id
app.delete('/v1/lead-gen/saved/:id', (req, res, next) => {
  try {
    const { companyId } = identity(req);
    const ok = db.deleteSaved(companyId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /health
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'lead-engine' }));

// ── Catch-all proxy → Railway ─────────────────────────────────────────────────

app.all('*', async (req: Request, res: Response) => {
  const target = `${RAILWAY_API}${req.path}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  try {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k !== 'host' && typeof v === 'string') headers[k] = v;
    }
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });
    const body = await upstream.text();
    res.status(upstream.status);
    upstream.headers.forEach((v, k) => { if (k !== 'transfer-encoding') res.setHeader(k, v); });
    res.send(body);
  } catch (err) {
    res.status(502).json({ error: `Upstream error: ${err}` });
  }
});

// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status ?? 500).json({ error: err.message });
});

app.listen(PORT, () => console.log(`[lead-engine] listening on :${PORT}`));

export default app;
