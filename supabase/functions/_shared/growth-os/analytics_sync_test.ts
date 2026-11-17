import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { syncConnection, syncWindow, type Connection } from "./analytics-sync.ts";
import { GoogleAccessError, type GoogleClient } from "./google.ts";

Deno.test("first sync backfills 90 days; later syncs refetch the last 3 days", () => {
  assertEquals(syncWindow(null, "2026-11-17", 1), { from: "2026-08-19", to: "2026-11-16" });
  assertEquals(syncWindow("2026-11-15", "2026-11-17", 3), { from: "2026-11-12", to: "2026-11-14" });
});

function fakeDb() {
  const upserts: { table: string; rows: Record<string, unknown>[]; onConflict: string }[] = [];
  const updates: { patch: Record<string, unknown>; filters: [string, unknown][] }[] = [];
  const db = {
    from(table: string) {
      return {
        upsert(rows: Record<string, unknown>[], o: { onConflict: string }) { upserts.push({ table, rows, onConflict: o.onConflict }); return Promise.resolve({ error: null }); },
        update(patch: Record<string, unknown>) {
          const filters: [string, unknown][] = [];
          const q = { eq(k: string, v: unknown) { filters.push([k, v]); return filters.length === 2 ? (updates.push({ patch, filters }), Promise.resolve({ error: null })) : q; } };
          return q;
        },
        insert() { return Promise.resolve({ error: null }); },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { db: db as any, upserts, updates };
}

const conn: Connection = { company_id: "c1", ga4_property_id: "533214056", gsc_site_url: "sc-domain:x.dk", status: "active", ga4_synced_through: null, gsc_synced_through: null, last_sync_at: null };
const NOW = Date.parse("2026-11-17T10:00:00Z");

function google(handler: (url: string, body: { dimensions: unknown[] }) => unknown) {
  return { post: (url: string, body: { dimensions: unknown[] }) => Promise.resolve(handler(url, body)) } as unknown as GoogleClient;
}

Deno.test("sync upserts on the natural keys (re-sync never double counts) and records progress", async () => {
  const { db, upserts, updates } = fakeDb();
  const g = google((url, body) => url.includes("analyticsdata")
    ? { rows: [{ dimensionValues: [{ value: "20261116" }, ...(body.dimensions.length === 3 ? [{ value: "/da" }] : []), { value: "Organic Search" }], metricValues: [{ value: "5" }, { value: "4" }, { value: "3" }, { value: "1" }] }] }
    : { rows: [{ keys: body.dimensions.length === 1 ? ["2026-11-14"] : ["2026-11-14", "crm", "https://x.dk/"], clicks: 2, impressions: 20, ctr: 0.1, position: 3 }] });
  const r = await syncConnection(db, g, conn, NOW);
  assertEquals(r.status, "active");
  assertEquals(upserts.map((u) => [u.table, u.onConflict]), [
    ["growth_ga4_daily", "company_id,day,channel_group"],
    ["growth_ga4_landing_daily", "company_id,day,landing_page,channel_group"],
    ["growth_gsc_daily", "company_id,day"],
    ["growth_gsc_query_page_daily", "company_id,day,query,page"],
  ]);
  assertEquals(upserts.every((u) => u.rows.every((row) => row.company_id === "c1")), true);
  assertEquals(updates[0].patch.ga4_synced_through, "2026-11-16");
  assertEquals(updates[0].patch.gsc_synced_through, "2026-11-14");
  assertEquals(updates[0].filters, [["company_id", "c1"], ["status", "active"]]);
});

Deno.test("missing Google access marks the connection no_access; other errors keep it active for a retry", async () => {
  const a = fakeDb();
  const denied = { post: () => Promise.reject(new GoogleAccessError("403: no permission", 403)) } as unknown as GoogleClient;
  assertEquals((await syncConnection(a.db, denied, conn, NOW)).status, "no_access");
  assertEquals(a.updates[0].patch.status, "no_access");
  const b = fakeDb();
  const flaky = { post: () => Promise.reject(new Error("timeout")) } as unknown as GoogleClient;
  const r = await syncConnection(b.db, flaky, conn, NOW);
  assertEquals(r.status, "error");
  assertEquals(b.updates[0].patch.status, "active");
  assertEquals(b.upserts.length, 0); // nothing half-written
});
