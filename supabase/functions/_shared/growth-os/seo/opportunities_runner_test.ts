import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { runOpportunities } from "./opportunities-runner.ts";
import type { GrowthTask } from "../engine.ts";

// Minimal in-memory stand-in for the supabase-js query builder (only what the runner uses).
type Row = Record<string, unknown>;
function memoryDb(tables: Record<string, Row[]>) {
  const writes: { op: string; table: string; rows: Row[] }[] = [];
  const db = {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let range: [number, number] | null = null;
      let patch: Row | null = null;
      const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
      const q = {
        select() { return q; },
        eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return q; },
        gte(k: string, v: string) { filters.push((r) => String(r[k]) >= v); return q; },
        lte(k: string, v: string) { filters.push((r) => String(r[k]) <= v); return q; },
        in(k: string, vs: unknown[]) { filters.push((r) => vs.includes(r[k])); return q; },
        order() { return q; },
        range(a: number, b: number) { range = [a, b]; return q; },
        maybeSingle() { return Promise.resolve({ data: rows()[0] ?? null, error: null }); },
        insert(r: Row | Row[]) { const arr = Array.isArray(r) ? r : [r]; (tables[table] ??= []).push(...arr.map((x) => ({ status: "proposed", ...x }))); writes.push({ op: "insert", table, rows: arr }); return Promise.resolve({ data: null, error: null }); },
        upsert(r: Row[]) { writes.push({ op: "upsert", table, rows: r }); return Promise.resolve({ data: null, error: null }); },
        update(p: Row) { patch = p; return q; },
        then(resolve: (v: { data: Row[] | null; error: null }) => void) {
          if (patch) { for (const r of rows()) Object.assign(r, patch); writes.push({ op: "update", table, rows: [patch] }); return resolve({ data: null, error: null }); }
          const all = rows();
          resolve({ data: range ? all.slice(range[0], range[1] + 1) : all, error: null });
        },
      };
      return q;
    },
  };
  // deno-lint-ignore no-explicit-any
  return { db: db as any, writes, tables };
}

const task: GrowthTask = { id: "t1", companyId: "c1", agentId: "seo-agent", type: "seo.opportunities", input: {}, budgetUsd: 0.05 };
const deps = { fetch: (() => Promise.reject(new Error("offline in test"))) as typeof fetch, now: () => Date.parse("2026-11-17T10:00:00Z") };

Deno.test("blocked, not failed and not invented, when analytics is not connected", async () => {
  const { db, writes } = memoryDb({ growth_analytics_connections: [] });
  const r = await runOpportunities(db, task, deps);
  assertEquals(r.status, "blocked");
  assertEquals(r.report.reason, "no analytics connection");
  assertEquals(writes.filter((w) => w.table === "growth_seo_recommendations").length, 0);
});

Deno.test("blocked while the connection is pending", async () => {
  const { db } = memoryDb({ growth_analytics_connections: [{ company_id: "c1", status: "pending", gsc_synced_through: "2026-11-14", ga4_synced_through: null }] });
  assertEquals((await runOpportunities(db, task, deps)).report.reason, "analytics connection is pending");
});

Deno.test("stores proposals from own-company rows only, verifies by recomputation, and does not duplicate open ones", async () => {
  const qp: Row[] = [];
  for (let i = 0; i < 10; i++) qp.push({ company_id: "c1", day: "2026-11-10", query: `q${i}`, page: `https://x.dk/p${i}`, clicks: 8, impressions: 100, position: 5 });
  qp.push({ company_id: "c1", day: "2026-11-10", query: "crm system", page: "https://x.dk/crm", clicks: 4, impressions: 1000, position: 5 });
  qp.push({ company_id: "OTHER", day: "2026-11-10", query: "secret", page: "https://other.dk/", clicks: 0, impressions: 5000, position: 4 });
  const mem = memoryDb({
    growth_analytics_connections: [{ company_id: "c1", status: "active", gsc_synced_through: "2026-11-14", ga4_synced_through: "2026-11-16" }],
    growth_gsc_query_page_daily: qp, growth_ga4_landing_daily: [], growth_seo_recommendations: [],
  });
  const r = await runOpportunities(mem.db, task, deps);
  assertEquals(r.status, "completed");
  assertEquals(r.verification.status, "verified");
  const recs = mem.tables.growth_seo_recommendations;
  assertEquals(recs.map((x) => x.fingerprint), ["ctr_gap|crm system|https://x.dk/crm"]);
  assert(recs.every((x) => x.company_id === "c1" && !String(x.target).includes("other.dk")));
  assertEquals((recs[0].evidence as { onpage_findings: { error: string } }).onpage_findings.error, "offline in test"); // fetch failure noted, run continues
  // second run: the open proposal is not inserted again
  const again = await runOpportunities(mem.db, { ...task, id: "t2" }, deps);
  assertEquals((again.report.recommendations as { new: number }).new, 0);
  assertEquals(mem.tables.growth_seo_recommendations.length, 1);
});
