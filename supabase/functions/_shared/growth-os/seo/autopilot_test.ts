import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dueSites, fallbackPlan, runAutopilot, sanitizePlan, type SiteRow } from "./autopilot.ts";
import { RateLimitedError } from "./free-llm.ts";
import type { GatewayConfig } from "../openrouter.ts";

// In-memory stand-in for the supabase-js query builder (only what the autopilot uses).
type Row = Record<string, unknown>;
function memoryDb(tables: Record<string, Row[]>) {
  let seq = 0;
  const db = {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Row | null = null;
      let inserted: Row[] | null = null;
      let head = false;
      let lim = Infinity;
      const all = () => (tables[table] ??= []);
      const rows = () => all().filter((r) => filters.every((f) => f(r)));
      const result = () => {
        if (inserted) return { data: inserted, error: null };
        if (patch) { for (const r of rows()) Object.assign(r, patch); return { data: null, error: null }; }
        const out = rows().slice(0, lim);
        return head ? { data: null, count: out.length, error: null } : { data: out, error: null };
      };
      const q = {
        select(_c?: string, o?: { head?: boolean }) { head = !!o?.head; return q; },
        eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return q; },
        neq(k: string, v: unknown) { filters.push((r) => r[k] !== v); return q; },
        gt(k: string, v: number) { filters.push((r) => (r[k] as number) > v); return q; },
        gte(k: string, v: string) { filters.push((r) => String(r[k]) >= v); return q; },
        lt(k: string, v: string) { filters.push((r) => String(r[k]) < v); return q; },
        not(k: string, _op: string, _v: null) { filters.push((r) => r[k] != null); return q; },
        order() { return q; },
        limit(n: number) { lim = n; return q; },
        insert(r: Row | Row[]) {
          inserted = (Array.isArray(r) ? r : [r]).map((x) => ({
            id: `id${++seq}`, created_at: new Date(seq * 1000).toISOString(), status: table === "growth_seo_tasks" ? "open" : undefined, attempts: 0,
            review_status: "pending", decision: "pending", llm_calls: 0, ...x,
          }));
          all().push(...inserted);
          return q;
        },
        update(p: Row) { patch = p; return q; },
        single() { return Promise.resolve({ data: result().data?.[0] ?? null, error: null }); },
        maybeSingle() { const r = result(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: null }); },
        then<T>(resolve: (v: unknown) => T, reject?: (e: unknown) => T) { return Promise.resolve().then(result).then(resolve, reject); },
      };
      return q;
    },
  };
  // deno-lint-ignore no-explicit-any
  return { db: db as any, tables };
}

const SITE = "https://www.x.dk";
const page = (h1: boolean) => `<html lang="da"><head><title>CRM til små virksomheder i Danmark</title><meta name="description" content="${"x".repeat(80)}"><link rel="canonical" href="${SITE}/da"></head><body>${h1 ? "<h1>Hej</h1><p>tekst her</p><a href=\"/da/privacy\">p</a>" : '<div id="root"></div>'}</body></html>`;
function site(html: string) {
  return ((url: string | URL) => {
    const u = String(url);
    if (u.endsWith("/sitemap.xml")) return Promise.resolve(new Response(`<urlset><url><loc>${SITE}/da</loc></url><url><loc>https://evil.example/</loc></url></urlset>`, { status: 200 }));
    if (u === `${SITE}/da`) return Promise.resolve(new Response(html, { status: 200, headers: { "content-type": "text/html" } }));
    return Promise.resolve(new Response("nope", { status: 404 }));
  }) as typeof fetch;
}
const cfg = {} as GatewayConfig;
const siteRow = (over: Partial<SiteRow> = {}): SiteRow => ({
  company_id: "c1", site_url: SITE, enabled: true, crawl_every_hours: 6, max_pages: 60, max_pending_drafts: 8, llm_calls_per_day: 12,
  product_facts: "- Pris: 499 kr. pr. bruger pr. måned.", topics: [{ slug: "/crm/gratis-crm", keyword: "gratis crm", title: "Gratis CRM" }], last_run_at: null, ...over,
});
const longBody = Array.from({ length: 450 }, (_, i) => `ord${i}`).join(" ");
const now = () => Date.parse("2026-11-18T10:00:00Z");

Deno.test("full round: crawl only own host, plan, draft, review; draft waits for a human", async () => {
  const mem = memoryDb({ growth_seo_sites: [{ company_id: "c1" }] });
  const prompts: string[] = [];
  const answers = [
    JSON.stringify([{ type: "page_draft", title: "Gratis CRM", target: "/crm/gratis-crm", priority: 1 }, { type: "technical_audit", title: "evil", target: "https://evil.example/", priority: 1 }]),
    JSON.stringify({ title: "Gratis CRM", meta_description: "m".repeat(80), h1: "Gratis CRM", content: longBody }),
    JSON.stringify({ score: 8, notes: "god" }),
  ];
  const r = await runAutopilot(mem.db, siteRow(), "manual", {
    fetch: site(page(false)), now, gateway: () => cfg, freeModels: [],
    llm: (_c, call) => { prompts.push(call.user); return Promise.resolve({ text: answers.shift()!, model: "m:free", promptTokens: 1, completionTokens: 1, costUsd: 0 }); },
  });
  assertEquals(r.status, "ok", JSON.stringify(mem.tables.growth_seo_runs.at(-1)?.log));
  assertEquals(r.llm_calls, 3);
  const pages = mem.tables.growth_seo_pages;
  assertEquals(pages.map((p) => p.url), [`${SITE}/da`]); // evil.example from the sitemap is not crawled
  assert(mem.tables.growth_seo_findings.some((f) => f.severity === "high" && String(f.issue).includes("0 ord")));
  const tasks = mem.tables.growth_seo_tasks;
  assertEquals(tasks.find((t) => t.type === "technical_audit")?.target, null); // off-site target dropped
  const draft = mem.tables.growth_seo_drafts[0];
  assertEquals([draft.review_status, draft.decision, draft.review_score], ["passed", "pending", 8]);
  assertEquals(tasks.find((t) => t.type === "page_draft")?.status, "done");
});

Deno.test("changes since the previous crawl are recorded", async () => {
  const mem = memoryDb({ growth_seo_sites: [{ company_id: "c1" }] });
  const deps = { fetch: site(page(false)), now, gateway: () => null, freeModels: [] };
  await runAutopilot(mem.db, siteRow(), "schedule", deps);
  await runAutopilot(mem.db, siteRow(), "schedule", { ...deps, fetch: site(page(true)) });
  const fields = mem.tables.growth_seo_changes.map((c) => c.field).sort();
  assertEquals(fields, ["h1_count", "score", "word_count"]);
});

Deno.test("rate limited: the task stays open with its attempts untouched", async () => {
  const mem = memoryDb({ growth_seo_sites: [{ company_id: "c1" }], growth_seo_tasks: [{ id: "t1", company_id: "c1", type: "technical_audit", title: "T", target: null, rationale: null, priority: 1, status: "open", attempts: 0 }] });
  const r = await runAutopilot(mem.db, siteRow(), "schedule", {
    fetch: site(page(true)), now, gateway: () => cfg, freeModels: [], llm: () => Promise.reject(new RateLimitedError("429")),
  });
  assertEquals(r.status, "ok", JSON.stringify(mem.tables.growth_seo_runs.at(-1)?.log));
  assertEquals([mem.tables.growth_seo_tasks[0].status, mem.tables.growth_seo_tasks[0].attempts], ["open", 0]);
});

Deno.test("daily cap reached: crawl only, no model call", async () => {
  const mem = memoryDb({ growth_seo_sites: [{ company_id: "c1" }], growth_seo_runs: [{ id: "old", company_id: "c1", started_at: "2026-11-18T05:00:00Z", llm_calls: 12, status: "ok", kind: "loop" }] });
  let called = 0;
  const r = await runAutopilot(mem.db, siteRow(), "schedule", { fetch: site(page(true)), now, gateway: () => cfg, freeModels: [], llm: () => { called++; return Promise.reject(new Error("x")); } });
  assertEquals([r.status, called], ["ok", 0]);
});

Deno.test("a too-short page draft is retried once, then fails", async () => {
  const mem = memoryDb({ growth_seo_sites: [{ company_id: "c1" }], growth_seo_tasks: [{ id: "t1", company_id: "c1", type: "page_draft", title: "T", target: "/crm/x", rationale: null, priority: 1, status: "open", attempts: 0 }] });
  const deps = { fetch: site(page(true)), now, gateway: () => cfg, freeModels: [], llm: () => Promise.resolve({ text: JSON.stringify({ title: "t", content: "for kort" }), model: "m:free", promptTokens: 0, completionTokens: 0, costUsd: 0 }) };
  await runAutopilot(mem.db, siteRow(), "schedule", deps);
  assertEquals([mem.tables.growth_seo_tasks[0].status, mem.tables.growth_seo_tasks[0].attempts], ["open", 1]);
  await runAutopilot(mem.db, siteRow(), "schedule", deps);
  assertEquals(mem.tables.growth_seo_tasks[0].status, "failed");
  assertEquals(mem.tables.growth_seo_drafts?.length ?? 0, 0);
});

Deno.test("no product facts: no page drafts are planned", () => {
  assertEquals(sanitizePlan([{ type: "page_draft", target: "/crm/x", title: "x" }], "www.x.dk", false), []);
  assertEquals(fallbackPlan([], [{ slug: "/a", keyword: "a", title: "A" }], false), []);
});

Deno.test("dueSites respects the interval and the enabled flag", () => {
  const t = Date.parse("2026-11-18T10:00:00Z");
  const due = dueSites([
    siteRow({ company_id: "a", last_run_at: "2026-11-18T05:00:00Z" }),
    siteRow({ company_id: "b", last_run_at: "2026-11-18T03:00:00Z" }),
    siteRow({ company_id: "c", enabled: false }),
    siteRow({ company_id: "d" }),
  ], t);
  assertEquals(due.map((s) => s.company_id), ["b", "d"]);
});
