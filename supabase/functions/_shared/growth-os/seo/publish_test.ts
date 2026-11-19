import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { autoPublish, contentBlockReason, type PublishSite, syncDeploy, validDeployHook } from "./publish.ts";

// In-memory stand-in for the supabase-js query builder (only what publish.ts uses).
type Row = Record<string, unknown>;
function memoryDb(tables: Record<string, Row[]>) {
  const db = {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Row | null = null, inserted: Row[] | null = null, head = false, lim = Infinity;
      let sort: { k: string; asc: boolean }[] = [];
      const all = () => (tables[table] ??= []);
      const rows = () => all().filter((r) => filters.every((f) => f(r)));
      const result = () => {
        if (inserted) return { data: inserted, error: null };
        if (patch) { for (const r of rows()) Object.assign(r, patch); return { data: null, error: null }; }
        let out = rows();
        const cmp = (x: unknown, y: unknown) => typeof x === "number" && typeof y === "number" ? x - y : String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
        for (const s of [...sort].reverse()) out = [...out].sort((a, b) => cmp(a[s.k], b[s.k]) * (s.asc ? 1 : -1));
        out = out.slice(0, lim);
        return head ? { data: null, count: out.length, error: null } : { data: out, error: null };
      };
      const q = {
        select(_c?: string, o?: { head?: boolean }) { head = !!o?.head; return q; },
        eq(k: string, v: unknown) { filters.push((r) => r[k] === v); return q; },
        gte(k: string, v: string | number) { filters.push((r) => r[k] != null && (typeof v === "number" ? (r[k] as number) >= v : String(r[k]) >= v)); return q; },
        is(k: string, _v: null) { filters.push((r) => r[k] == null); return q; },
        not(k: string, _op: string, _v: null) { filters.push((r) => r[k] != null); return q; },
        order(k: string, o?: { ascending?: boolean }) { sort.push({ k, asc: o?.ascending !== false }); return q; },
        limit(n: number) { lim = n; return q; },
        insert(r: Row | Row[]) { inserted = Array.isArray(r) ? r : [r]; all().push(...inserted); return q; },
        update(p: Row) { patch = p; return q; },
        maybeSingle() { const r = result(); return Promise.resolve({ data: (r.data as Row[] | null)?.[0] ?? null, error: null }); },
        then<T>(resolve: (v: unknown) => T, reject?: (e: unknown) => T) { return Promise.resolve().then(result).then(resolve, reject); },
      };
      sort = [];
      return q;
    },
  };
  // deno-lint-ignore no-explicit-any
  return { db: db as any, tables };
}

const HOST = "www.x.dk";
const body = (extra = "") => Array.from({ length: 420 }, (_, i) => `ord${i}`).join(" ") + " " + extra;
const NOW = Date.parse("2026-11-19T12:00:00Z");
const site = (over: Partial<PublishSite> = {}): PublishSite => ({
  company_id: "c1", site_url: `https://${HOST}`, auto_publish: true, auto_publish_since: "2026-11-19T00:00:00Z",
  publish_min_score: 8, max_publish_per_day: 1, last_deploy_requested_at: null, ...over,
});
const draft = (over: Row = {}): Row => ({
  id: "d1", company_id: "c1", kind: "page", slug: "/crm/gratis-crm", title: "Gratis CRM", meta_description: "m", h1: "Gratis CRM", body: body(),
  review_status: "passed", review_score: 9, decision: "pending", published_at: null, unpublished_at: null, legacy_id: null,
  publish_block_reason: null, created_at: "2026-11-19T10:00:00Z", ...over,
});

Deno.test("contentBlockReason: invented prices, trial lengths, outside links and short texts are blocked", () => {
  assertEquals(contentBlockReason({ slug: "/crm/a", title: "T", body: body("Prisen er 499 kr. pr. bruger.") }, HOST), null);
  assertEquals(contentBlockReason({ slug: "/crm/a", title: "T", body: body(`Se [forsiden](https://${HOST}/da) og https://x.dk/da.`) }, HOST), null);
  assert(contentBlockReason({ slug: "/crm/a", title: "T", body: body("Det koster kun 299 kr. om måneden.") }, HOST)?.includes("pris"));
  assert(contentBlockReason({ slug: "/crm/a", title: "T", body: body("Prøv det i 14 dage gratis.") }, HOST)?.includes("prøveperioden"));
  assert(contentBlockReason({ slug: "/crm/a", title: "T", body: body("Læs mere på https://competitor.com/crm") }, HOST)?.includes("andet website"));
  assert(contentBlockReason({ slug: "/crm/a", title: "T", body: "for kort" }, HOST)?.includes("for kort"));
  assert(contentBlockReason({ slug: "/crm/a", title: "T", body: body("<script>alert(1)</script>") }, HOST)?.includes("HTML"));
  assertEquals(contentBlockReason({ slug: "https://evil", title: "T", body: body() }, HOST), "ugyldig sti");
});

Deno.test("autoPublish: off by default, publishes the best draft, respects the daily cap and logs it", async () => {
  const mem = memoryDb({ growth_seo_drafts: [draft({ id: "low", review_score: 8 }), draft({ id: "best", slug: "/crm/ai-crm", review_score: 10 })], growth_audit_log: [] });
  assertEquals(await autoPublish(mem.db, site({ auto_publish: false }), NOW), []);
  assertEquals(await autoPublish(mem.db, site(), NOW), ["Gratis CRM"]);
  const best = mem.tables.growth_seo_drafts.find((d) => d.id === "best")!;
  assertEquals([best.published_by, best.decision, typeof best.published_at], ["autopilot", "approved", "string"]);
  assertEquals(mem.tables.growth_seo_drafts.find((d) => d.id === "low")!.published_at, null); // cap of 1 per day
  assertEquals(await autoPublish(mem.db, site(), NOW + 3_600_000), []);
  assertEquals(mem.tables.growth_audit_log.map((a) => a.event), ["seo_draft.published"]);
});

Deno.test("autoPublish: never imported, older, low-score, blocked or duplicate-path drafts", async () => {
  const mem = memoryDb({ growth_seo_drafts: [
    draft({ id: "legacy", legacy_id: 7 }),
    draft({ id: "old", created_at: "2026-11-18T10:00:00Z" }),
    draft({ id: "low", review_score: 7 }),
    draft({ id: "price", body: body("Kun 199 kr.") }),
    draft({ id: "live", slug: "/crm/x", published_at: "2026-11-19T09:00:00Z", published_by: "user", decision: "approved" }),
    draft({ id: "dup", slug: "/crm/x" }),
  ], growth_audit_log: [] });
  assertEquals(await autoPublish(mem.db, site({ max_publish_per_day: 5 }), NOW), []);
  const by = (id: string) => mem.tables.growth_seo_drafts.find((d) => d.id === id)!;
  assert(String(by("price").publish_block_reason).includes("pris"));
  assert(String(by("dup").publish_block_reason).includes("samme sti"));
  for (const id of ["legacy", "old", "low", "price", "dup"]) assertEquals(by(id).published_at, null, id);
});

Deno.test("syncDeploy: calls the Vercel hook once per change, never another URL", async () => {
  assertEquals(validDeployHook("https://api.vercel.com/v1/integrations/deploy/prj_1/abc"), "https://api.vercel.com/v1/integrations/deploy/prj_1/abc");
  assertEquals(validDeployHook("https://evil.example/v1/integrations/deploy/x"), null);
  assertEquals(validDeployHook("http://api.vercel.com/v1/integrations/deploy/x"), null);
  const mem = memoryDb({ growth_seo_drafts: [draft({ published_at: "2026-11-19T11:00:00Z" })], growth_seo_sites: [{ company_id: "c1", last_deploy_requested_at: null }] });
  const calls: string[] = [];
  const f = ((u: string) => { calls.push(u); return Promise.resolve(new Response("{}", { status: 201 })); }) as typeof fetch;
  const hook = "https://api.vercel.com/v1/integrations/deploy/prj_1/abc";
  assertEquals(await syncDeploy(mem.db, site(), { fetch: f, now: () => NOW }, null), false);
  assertEquals(await syncDeploy(mem.db, site(), { fetch: f, now: () => NOW }, hook), true);
  const after = site({ last_deploy_requested_at: String(mem.tables.growth_seo_sites[0].last_deploy_requested_at) });
  assertEquals(await syncDeploy(mem.db, after, { fetch: f, now: () => NOW }, hook), false);
  assertEquals(calls, [hook]);
});
