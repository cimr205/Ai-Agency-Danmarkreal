#!/usr/bin/env node
// One-time (re-runnable) import of the standalone ~/seo-autopilot SQLite history
// into the Growth OS tables (migration 20261118120000) for one company.
//
//   railway run node scripts/growth-os/import-seo-autopilot.mjs --db ~/seo-autopilot/data/seo-autopilot.db --company <uuid> [--dry-run]
//
// Needs Node >= 24 (node:sqlite) and SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the
// environment (`railway run` injects them; they are never printed). The SQLite file is
// opened read-only. Every row keeps its old id in legacy_id, so running it again only
// adds what is new and refreshes the status of tasks/drafts already imported.
// The old reviewer's "approved" is imported as review_status 'passed' with decision
// 'pending': no person ever approved those drafts.
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { db: { type: 'string' }, company: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
if (!args.db || !/^[0-9a-f-]{36}$/.test(args.company ?? '')) throw new Error('usage: --db <sqlite file> --company <uuid> [--dry-run]');
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use `railway run`)');
const company = args.company;
const dry = !!args['dry-run'];
const sqlite = new DatabaseSync(args.db, { readOnly: true });
const all = (sql, ...p) => sqlite.prepare(sql).all(...p);

async function rest(method, path, body, prefer = 'return=minimal') {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
  });
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 || prefer === 'return=minimal' ? null : res.json();
}
const existing = async (table) => new Map((await rest('GET', `${table}?select=id,legacy_id&company_id=eq.${company}&legacy_id=not.is.null&limit=100000`, undefined, '')).map((r) => [r.legacy_id, r.id]));
async function insert(table, rows, returning = false) {
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    if (dry) continue;
    const r = await rest('POST', returning ? `${table}?select=id,legacy_id` : table, rows.slice(i, i + 500), returning ? 'return=representation' : 'return=minimal');
    if (r) out.push(...r);
  }
  return out;
}
const iso = (s) => (s ? new Date(s).toISOString() : null);
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const clamp = (n, lo, hi) => (n === null || n === undefined ? null : Math.max(lo, Math.min(hi, Math.round(n))));

// ── runs (+ their pages, findings, changes) ─────────────────────────────────
const runIds = await existing('growth_seo_runs');
const runs = all('SELECT * FROM runs ORDER BY id').filter((r) => r.status !== 'running');
const count = (t, id) => sqlite.prepare(`SELECT COUNT(*) n FROM ${t} WHERE run_id = ?`).get(id).n;
const newRuns = runs.filter((r) => !runIds.has(r.id));
const created = await insert('growth_seo_runs', newRuns.map((r) => ({
  company_id: company, kind: r.kind, trigger: r.trigger === 'manual' ? 'manual' : r.trigger === 'schedule' ? 'schedule' : 'import',
  status: r.status === 'ok' ? 'ok' : 'error', score: clamp(r.score, 0, 100), pages: r.pages,
  findings: count('findings', r.id), changes: count('changes', r.id),
  models: json(r.models, []), prompt_tokens: r.prompt_tokens ?? 0, completion_tokens: r.completion_tokens ?? 0, cost_usd: r.cost_usd ?? 0,
  summary: r.summary, error: r.error, log: json(r.log, []), legacy_id: r.id, started_at: iso(r.started_at), finished_at: iso(r.finished_at),
})), true);
for (const c of created) runIds.set(c.legacy_id, c.id);
let pages = 0, findings = 0, changes = 0;
for (const r of newRuns) {
  const run_id = runIds.get(r.id);
  const p = all('SELECT * FROM pages WHERE run_id = ?', r.id).map((x) => ({
    run_id, company_id: company, url: x.url, status: x.status ?? 0, ms: x.ms, bytes: x.bytes, title: x.title, meta_description: x.meta_description,
    canonical: x.canonical, robots: x.robots, lang: x.lang, h1_count: x.h1_count ?? 0, word_count: x.word_count ?? 0, json_ld: json(x.json_ld, []),
    internal_links: x.internal_links ?? 0, has_og_image: !!x.has_og_image, score: clamp(x.score, 0, 100) ?? 0,
  }));
  const f = all('SELECT url, severity, issue, fix FROM findings WHERE run_id = ?', r.id).map((x) => ({ run_id, company_id: company, ...x }));
  const c = all('SELECT url, field, before, after FROM changes WHERE run_id = ?', r.id).map((x) => ({ run_id, company_id: company, ...x }));
  await insert('growth_seo_pages', p); await insert('growth_seo_findings', f); await insert('growth_seo_changes', c);
  pages += p.length; findings += f.length; changes += c.length;
}

// ── tasks ───────────────────────────────────────────────────────────────────
const taskIds = await existing('growth_seo_tasks');
const tasks = all('SELECT * FROM tasks ORDER BY id');
const taskRow = (t) => ({ status: t.status, attempts: t.attempts ?? 0, error: t.error });
const createdTasks = await insert('growth_seo_tasks', tasks.filter((t) => !taskIds.has(t.id)).map((t) => ({
  company_id: company, run_id: runIds.get(t.run_id) ?? null, type: t.type, title: t.title, target: t.target, rationale: t.rationale,
  priority: clamp(t.priority, 1, 3) ?? 2, ...taskRow(t), legacy_id: t.id, created_at: iso(t.created_at), updated_at: iso(t.created_at),
})), true);
for (const c of createdTasks) taskIds.set(c.legacy_id, c.id);
let refreshed = 0;
for (const t of tasks.filter((x) => !createdTasks.some((c) => c.legacy_id === x.id))) {
  if (!dry) await rest('PATCH', `growth_seo_tasks?id=eq.${taskIds.get(t.id)}&company_id=eq.${company}`, taskRow(t));
  refreshed++;
}

// ── drafts ──────────────────────────────────────────────────────────────────
const draftIds = await existing('growth_seo_drafts');
const review = (s) => (s === 'approved' ? 'passed' : s === 'rejected' ? 'failed' : 'pending');
const drafts = all('SELECT * FROM drafts ORDER BY id').filter((d) => !draftIds.has(d.id));
await insert('growth_seo_drafts', drafts.map((d) => {
  const c = json(d.content, {});
  return {
    company_id: company, task_id: taskIds.get(d.task_id) ?? null, run_id: runIds.get(d.run_id) ?? null, kind: d.kind, slug: d.slug,
    title: d.title, meta_description: d.meta_description, h1: d.h1, summary: typeof c.summary === 'string' ? c.summary : null,
    body: typeof c.body === 'string' ? c.body : '', worker_model: d.worker_model, review_model: d.review_model,
    review_score: clamp(d.review_score, 1, 10), review_notes: d.review_notes, review_status: review(d.status), decision: 'pending',
    legacy_id: d.id, created_at: iso(d.created_at),
  };
}));

// ── reports (REA / GA4 history) ─────────────────────────────────────────────
const reportIds = await existing('growth_seo_reports');
const reports = all('SELECT * FROM reports ORDER BY id').filter((r) => !reportIds.has(r.id) && (r.kind === 'rea' || r.kind === 'ga4'));
await insert('growth_seo_reports', reports.map((r) => ({
  company_id: company, run_id: runIds.get(r.run_id) ?? null, kind: r.kind, target: r.target, title: r.title, body: r.body, legacy_id: r.id, created_at: iso(r.created_at),
})));

console.log(JSON.stringify({
  dry_run: dry, runs: { in_sqlite: runs.length, new: newRuns.length }, pages, findings, changes,
  tasks: { new: tasks.length - refreshed, refreshed }, drafts: { new: drafts.length }, reports: { new: reports.length },
}, null, 2));
