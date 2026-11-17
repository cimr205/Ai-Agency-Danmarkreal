// Executor for seo-agent / seo.opportunities (skill search-console-analysis v1.0.0).
// OBSERVE synced GA4 + Search Console rows → find opportunities → enrich the top
// pages with the on-page audit → store recommendations as PROPOSALS (Level 1; a
// human approves and implements) → measure implemented ones before/after →
// independent recomputation as verification → report.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import type { GrowthTask } from "../engine.ts";
import { auditHtml, fetchPublicPage } from "./onpage.ts";
import { findOpportunities, type LandingRow, measureOutcome, periods, type QPRow, type Recommendation } from "./opportunities.ts";

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface OpportunitiesResult {
  status: "completed" | "blocked";
  report: Record<string, unknown> & { status: string };
  verification: { status: "verified" | "discrepancy" | "inconclusive"; findings: string[] };
}

export interface OpportunityDeps { fetch: typeof fetch; now: () => number }

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/** All rows of one company in a day range, paged (PostgREST caps responses). */
async function loadRows<T>(db: Db, table: string, cols: string, companyId: string, from: string, to: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await must(db.from(table).select(cols).eq("company_id", companyId).gte("day", from).lte("day", to)
      .order("day").range(offset, offset + 999), table) as T[];
    out.push(...page);
    if (page.length < 1000 || out.length >= 100_000) return out;
  }
}

async function activity(db: Db, task: GrowthTask, phase: string, action: string, status: string, detail: Record<string, unknown>) {
  await must(db.from("growth_activity_events").insert({ company_id: task.companyId, task_id: task.id, agent_id: task.agentId, phase, action, status, detail }), "activity");
}

export async function runOpportunities(db: Db, task: GrowthTask, deps: OpportunityDeps): Promise<OpportunitiesResult> {
  // OBSERVE: only an active connection with synced data counts. No data → no recommendations, never invented ones.
  const conn = await must(db.from("growth_analytics_connections").select("status, ga4_synced_through, gsc_synced_through")
    .eq("company_id", task.companyId).maybeSingle(), "connection") as { status: string; ga4_synced_through: string | null; gsc_synced_through: string | null } | null;
  const lastDay = conn?.gsc_synced_through ?? conn?.ga4_synced_through ?? null;
  if (!conn || conn.status !== "active" || !lastDay) {
    const reason = !conn ? "no analytics connection" : conn.status !== "active" ? `analytics connection is ${conn.status}` : "no synced data yet";
    await activity(db, task, "observe", "analytics.read", "blocked", { reason });
    return { status: "blocked", report: { status: "blocked", reason }, verification: { status: "inconclusive", findings: [reason] } };
  }
  const p = periods(lastDay);
  const load = async () => ({
    qp: await loadRows<QPRow>(db, "growth_gsc_query_page_daily", "day, query, page, clicks, impressions, position", task.companyId, p.previous.from, lastDay),
    landing: await loadRows<LandingRow>(db, "growth_ga4_landing_daily", "day, landing_page, channel_group, sessions, key_events", task.companyId, p.previous.from, lastDay),
  });
  const data = await load();
  await activity(db, task, "observe", "analytics.read", "ok", { period: p, gsc_rows: data.qp.length, ga4_landing_rows: data.landing.length });

  // PLAN/EXECUTE: deterministic analysis.
  const recs = findOpportunities(data.qp, data.landing, p);

  // Enrich the top pages with the on-page audit (public URLs only; failures are noted, not fatal).
  const pages = [...new Set(recs.filter((r) => /^https?:\/\//.test(r.target)).map((r) => r.target))].slice(0, 3);
  const audits = new Map<string, unknown>();
  for (const url of pages) {
    try {
      const page = await fetchPublicPage(url, deps.fetch, deps.now);
      audits.set(url, auditHtml(page.html, page.finalUrl).filter((c) => c.status !== "pass").map((c) => ({ id: c.id, status: c.status, value: c.value, expected: c.expected })));
    } catch (e) {
      audits.set(url, { error: (e as Error).message });
    }
  }
  const withAudit = (r: Recommendation) => (audits.has(r.target) ? { ...r.evidence, onpage_findings: audits.get(r.target) } : r.evidence);

  // Store as proposals; one open recommendation per fingerprint.
  const open = await must(db.from("growth_seo_recommendations").select("fingerprint").eq("company_id", task.companyId)
    .in("status", ["proposed", "approved", "implemented"]), "open recs") as { fingerprint: string }[];
  const openSet = new Set(open.map((o) => o.fingerprint));
  const fresh = recs.filter((r) => !openSet.has(r.fingerprint));
  if (fresh.length) {
    await must(db.from("growth_seo_recommendations").insert(fresh.map((r) => ({
      company_id: task.companyId, task_id: task.id, fingerprint: r.fingerprint, kind: r.kind, target: r.target, problem: r.problem,
      evidence: withAudit(r), action: r.action, priority: r.priority, expected_effect: r.expected_effect,
    }))), "insert recs");
  }
  await activity(db, task, "execute", "seo.opportunities", "ok", { found: recs.length, new: fresh.length, already_open: recs.length - fresh.length });

  // EVALUATE: before/after for implemented recommendations with 28 full days after.
  const implemented = await must(db.from("growth_seo_recommendations").select("id, kind, target, evidence, implemented_on")
    .eq("company_id", task.companyId).eq("status", "implemented"), "implemented recs") as { id: string; kind: Recommendation["kind"]; target: string; evidence: { query?: string }; implemented_on: string }[];
  let measured = 0;
  for (const r of implemented) {
    const due = Date.parse(`${r.implemented_on}T00:00:00Z`) + 28 * 86_400_000 <= Date.parse(`${lastDay}T00:00:00Z`);
    if (!due) continue;
    const fromDay = new Date(Date.parse(`${r.implemented_on}T00:00:00Z`) - 28 * 86_400_000).toISOString().slice(0, 10);
    const qp = await loadRows<QPRow>(db, "growth_gsc_query_page_daily", "day, query, page, clicks, impressions, position", task.companyId, fromDay, lastDay);
    const landing = await loadRows<LandingRow>(db, "growth_ga4_landing_daily", "day, landing_page, channel_group, sessions, key_events", task.companyId, fromDay, lastDay);
    const outcome = measureOutcome(r.kind, r.target, r.evidence.query ?? null, qp, landing, r.implemented_on);
    await must(db.from("growth_seo_recommendations").update({ status: "measured", baseline: outcome.before, outcome, updated_at: new Date(deps.now()).toISOString() })
      .eq("id", r.id).eq("company_id", task.companyId).eq("status", "implemented"), "measure");
    measured++;
  }
  await activity(db, task, "evaluate", "seo.measure_outcomes", "ok", { measured });

  // VERIFY: reload the same rows independently and recompute; the fingerprints must match.
  const again = await load();
  const recomputed = new Set(findOpportunities(again.qp, again.landing, p).map((r) => r.fingerprint));
  const original = new Set(recs.map((r) => r.fingerprint));
  const missing = [...original].filter((f) => !recomputed.has(f));
  const extra = [...recomputed].filter((f) => !original.has(f));
  const verification: OpportunitiesResult["verification"] = missing.length || extra.length
    ? { status: again.qp.length !== data.qp.length ? "inconclusive" : "discrepancy", findings: [...missing.map((f) => `not reproduced: ${f}`), ...extra.map((f) => `new on recompute: ${f}`)] }
    : { status: "verified", findings: [] };
  await activity(db, task, "verify", "seo.opportunities.recompute", verification.status === "verified" ? "ok" : "failed", { ...verification });

  const report = {
    status: "completed", agent: "seo-agent", skill: "search-console-analysis@1.0.0", period: p,
    data: { gsc_query_page_rows: data.qp.length, ga4_landing_rows: data.landing.length },
    recommendations: { found: recs.length, new: fresh.length }, measured,
    note: recs.length ? "Recommendations are proposals; nothing was changed on the website." : "No opportunity met the thresholds in this period.",
  };
  await must(db.from("growth_reports").upsert([
    { company_id: task.companyId, task_id: task.id, agent_id: task.agentId, kind: "agent", body: report },
    { company_id: task.companyId, task_id: task.id, agent_id: "seo-verifier", kind: "verification", body: verification },
  ], { onConflict: "task_id,kind" }), "reports");
  return { status: "completed", report, verification };
}
