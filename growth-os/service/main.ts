// Growth OS service (Railway). One long-running process that owns the whole agent
// runtime: it polls the Supabase queue, runs tasks through the engine and reports
// its own state on GET /health. Users enqueue through the growth_enqueue_task RPC
// (RLS + role checks in SQL); this process never accepts work over HTTP.
//
// Required env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Model calls:   LOCAL_LLM_BASE_URL, LOCAL_LLM_MODEL, LOCAL_LLM_API_KEY (OpenRouter); without
//                them tasks run their deterministic checks only and say so in the report.
// Google data:   GOOGLE_SERVICE_ACCOUNT_JSON (read-only GA4 + Search Console); without it the
//                analytics sync stays off and the dashboard says "not connected".
// Optional env:  GROWTH_OS_POLL_SECONDS (15), GROWTH_OS_LEASE_SECONDS (180), GROWTH_OS_ANALYTICS_SYNC_HOURS (6),
//                GROWTH_OS_MODEL_CLASSES, GROWTH_OS_COMPLEX_PROVIDERS, GROWTH_OS_OLLAMA_*, PORT
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { gatewayConfigFromEnv } from "../../supabase/functions/_shared/growth-os/openrouter.ts";
import { runLoop, type WorkerStatus } from "../../supabase/functions/_shared/growth-os/worker.ts";
import { type AnalyticsStatus, runAnalyticsLoop } from "../../supabase/functions/_shared/growth-os/analytics-sync.ts";
import { GoogleClient, parseServiceAccount } from "../../supabase/functions/_shared/growth-os/google.ts";
import { healthHandler, LLM_ENV, missingEnv } from "./health.ts";

const env = (k: string) => Deno.env.get(k) || undefined;
const missing = missingEnv(env);
const worker = `railway-${(env("RAILWAY_REPLICA_ID") ?? crypto.randomUUID()).slice(0, 8)}`;
const status: WorkerStatus = {
  state: "starting", worker, started_at: new Date().toISOString(),
  last_poll_at: null, tasks_processed: 0, last_task: null, last_error: null,
};

const abort = new AbortController();
let loop: Promise<void> = Promise.resolve();
let analyticsLoop: Promise<void> = Promise.resolve();
const analytics: AnalyticsStatus = { state: "not_configured", last_run_at: null, connections_synced: 0, last_result: [], last_error: null };

if (missing.length) {
  status.state = "error";
  status.last_error = `missing env: ${missing.join(", ")}`;
  console.error(`[growth-os] ${status.last_error}; the worker will not start`);
} else {
  const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const pollMs = 1000 * Math.max(5, Number(env("GROWTH_OS_POLL_SECONDS") ?? 15));
  console.log(`[growth-os] worker ${worker} polling every ${pollMs / 1000}s`);
  loop = runLoop(
    { db, worker, leaseSeconds: Math.max(60, Number(env("GROWTH_OS_LEASE_SECONDS") ?? 180)), gateway: () => gatewayConfigFromEnv(env) },
    { pollMs, maxBackoffMs: 5 * 60_000, signal: abort.signal, status },
  ).catch((e) => { status.state = "error"; status.last_error = (e as Error).message; });

  const sa = parseServiceAccount(env("GOOGLE_SERVICE_ACCOUNT_JSON"));
  if (sa) {
    const google = new GoogleClient(sa, { fetch, now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    analytics.state = "idle";
    console.log(`[growth-os] analytics sync on (service account ${sa.client_email})`);
    analyticsLoop = runAnalyticsLoop(db, google, {
      everyMs: 3_600_000 * Math.max(1, Number(env("GROWTH_OS_ANALYTICS_SYNC_HOURS") ?? 6)), checkMs: 3_600_000,
      now: Date.now, signal: abort.signal, status: analytics,
    }).catch((e) => { analytics.state = "error"; analytics.last_error = (e as Error).message; });
  } else {
    console.warn("[growth-os] analytics sync off: GOOGLE_SERVICE_ACCOUNT_JSON missing or invalid");
  }
}

const info = {
  llm: missingEnv(env, LLM_ENV).length ? "not_configured" as const : "configured" as const,
  complexFallback: env("GROWTH_OS_OLLAMA_BASE_URL") ? "ollama" as const : "none" as const,
};
if (info.llm === "not_configured") console.warn(`[growth-os] model calls disabled: missing ${missingEnv(env, LLM_ENV).join(", ")}`);
const server = Deno.serve({ port: Number(env("PORT") ?? 8080), hostname: "0.0.0.0" }, healthHandler(status, info, analytics));

// Railway sends SIGTERM on redeploy: finish the task in hand, then exit. A task cut
// off harder than that keeps its lease and is reclaimed after it expires.
Deno.addSignalListener("SIGTERM", async () => {
  console.log("[growth-os] SIGTERM: finishing current task");
  abort.abort();
  await Promise.all([loop, analyticsLoop]);
  await server.shutdown();
  Deno.exit(0);
});
