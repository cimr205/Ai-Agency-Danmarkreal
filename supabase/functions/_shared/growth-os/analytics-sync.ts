// Syncs GA4 and Search Console snapshots for every ACTIVE analytics connection.
// Idempotent: rows are upserted on (company, day, dimensions), and the last few
// days are always re-fetched because both sources revise recent data.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { ga4Daily, ga4Landing, GoogleAccessError, type GoogleClient, gscDaily, gscQueryPage } from "./google.ts";

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface Connection {
  company_id: string;
  ga4_property_id: string | null;
  gsc_site_url: string | null;
  status: string;
  ga4_synced_through: string | null;
  gsc_synced_through: string | null;
  last_sync_at: string | null;
}

export interface SyncResult { company_id: string; ga4_rows: number; ga4_landing_rows: number; gsc_rows: number; gsc_query_rows: number; status: string; error: string | null }

export const BACKFILL_DAYS = 90;
export const REFETCH_DAYS = 3;
/** Search Console "final" data lags about 2–3 days. */
export const GSC_LAG_DAYS = 3;

export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => isoDay(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000);

/** Window to fetch: full backfill the first time, otherwise from a few days before the last synced day. */
export function syncWindow(syncedThrough: string | null, today: string, lagDays: number) {
  const to = addDays(today, -lagDays);
  const backfillFrom = addDays(today, -BACKFILL_DAYS);
  const from = syncedThrough ? addDays(syncedThrough, -REFETCH_DAYS) : backfillFrom;
  return { from: from < backfillFrom ? backfillFrom : from, to };
}

async function upsert(db: Db, table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function syncConnection(db: Db, google: GoogleClient, c: Connection, now: number): Promise<SyncResult> {
  const today = isoDay(now);
  const res: SyncResult = { company_id: c.company_id, ga4_rows: 0, ga4_landing_rows: 0, gsc_rows: 0, gsc_query_rows: 0, status: "active", error: null };
  const patch: Record<string, unknown> = { last_sync_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() };
  const stamp = { company_id: c.company_id, synced_at: new Date(now).toISOString() };
  const errors: string[] = [];
  let noAccess = false;

  if (c.ga4_property_id) {
    const w = syncWindow(c.ga4_synced_through, today, 1);
    try {
      const daily = await ga4Daily(google, c.ga4_property_id, w.from, w.to);
      await upsert(db, "growth_ga4_daily", daily.rows.map((r) => ({ ...stamp, ...r })), "company_id,day,channel_group");
      const landing = await ga4Landing(google, c.ga4_property_id, w.from, w.to);
      await upsert(db, "growth_ga4_landing_daily", landing.map((r) => ({ ...stamp, ...r })), "company_id,day,landing_page,channel_group");
      res.ga4_rows = daily.rows.length; res.ga4_landing_rows = landing.length;
      patch.ga4_synced_through = w.to;
    } catch (e) {
      noAccess ||= e instanceof GoogleAccessError;
      errors.push(`GA4: ${(e as Error).message}`);
    }
  }

  if (c.gsc_site_url) {
    const w = syncWindow(c.gsc_synced_through, today, GSC_LAG_DAYS);
    try {
      const daily = await gscDaily(google, c.gsc_site_url, w.from, w.to);
      await upsert(db, "growth_gsc_daily", daily.map((r) => ({ ...stamp, ...r })), "company_id,day");
      const qp = await gscQueryPage(google, c.gsc_site_url, w.from, w.to);
      await upsert(db, "growth_gsc_query_page_daily", qp.map((r) => ({ ...stamp, ...r })), "company_id,day,query,page");
      res.gsc_rows = daily.length; res.gsc_query_rows = qp.length;
      patch.gsc_synced_through = w.to;
    } catch (e) {
      noAccess ||= e instanceof GoogleAccessError;
      errors.push(`Search Console: ${(e as Error).message}`);
    }
  }

  res.error = errors.length ? errors.join(" | ").slice(0, 1000) : null;
  // Missing access is a configuration problem the customer must fix: stop retrying until re-requested.
  res.status = noAccess ? "no_access" : errors.length ? "error" : "active";
  // A transient error keeps the connection active so the next cycle retries.
  patch.status = res.status === "error" ? "active" : res.status;
  patch.last_error = res.error;
  const { error } = await db.from("growth_analytics_connections").update(patch).eq("company_id", c.company_id).eq("status", "active");
  if (error) throw new Error(`connection update: ${error.message}`);
  await db.from("growth_audit_log").insert({ company_id: c.company_id, actor_type: "system", actor_id: "analytics-sync", event: "analytics.synced", detail: { ...res } });
  return res;
}

/** Connections due for a sync (active, never synced or older than `everyMs`). */
export async function dueConnections(db: Db, now: number, everyMs: number): Promise<Connection[]> {
  const { data, error } = await db.from("growth_analytics_connections")
    .select("company_id, ga4_property_id, gsc_site_url, status, ga4_synced_through, gsc_synced_through, last_sync_at")
    .eq("status", "active");
  if (error) throw new Error(`connections: ${error.message}`);
  return ((data ?? []) as Connection[]).filter((c) => !c.last_sync_at || now - Date.parse(c.last_sync_at) >= everyMs);
}

export interface AnalyticsStatus {
  state: "not_configured" | "idle" | "syncing" | "error";
  last_run_at: string | null;
  connections_synced: number;
  last_result: { company_id: string; status: string; error: string | null }[];
  last_error: string | null;
}

/**
 * Every `checkMs` (default hourly) syncs the connections whose last sync is older
 * than `everyMs` (default 6 h). Errors are recorded and retried next cycle; the
 * loop never crashes the service.
 */
export async function runAnalyticsLoop(db: Db, google: GoogleClient, opts: { everyMs: number; checkMs: number; now: () => number; signal: AbortSignal; status: AnalyticsStatus }) {
  const wait = (ms: number) => new Promise<void>((resolve) => {
    if (opts.signal.aborted) return resolve();
    const t = setTimeout(() => { opts.signal.removeEventListener("abort", stop); resolve(); }, ms);
    const stop = () => { clearTimeout(t); resolve(); };
    opts.signal.addEventListener("abort", stop, { once: true });
  });
  while (!opts.signal.aborted) {
    try {
      const due = await dueConnections(db, opts.now(), opts.everyMs);
      opts.status.state = due.length ? "syncing" : "idle";
      const results = [];
      for (const c of due) {
        if (opts.signal.aborted) break;
        const r = await syncConnection(db, google, c, opts.now());
        results.push({ company_id: r.company_id, status: r.status, error: r.error });
        opts.status.connections_synced++;
      }
      if (results.length) opts.status.last_result = results;
      opts.status.state = "idle";
      opts.status.last_error = null;
    } catch (e) {
      opts.status.state = "error";
      opts.status.last_error = (e as Error).message;
    }
    opts.status.last_run_at = new Date(opts.now()).toISOString();
    await wait(opts.checkMs);
  }
}
