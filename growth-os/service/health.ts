import type { WorkerStatus } from "../../supabase/functions/_shared/growth-os/worker.ts";
import type { AnalyticsStatus } from "../../supabase/functions/_shared/growth-os/analytics-sync.ts";
import type { AutopilotStatus } from "../../supabase/functions/_shared/growth-os/seo/autopilot.ts";

export const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
/** Without these the engine still runs its deterministic checks, but makes no model calls. */
export const LLM_ENV = ["LOCAL_LLM_BASE_URL", "LOCAL_LLM_MODEL", "LOCAL_LLM_API_KEY"] as const;

/** Names only: values are never logged or returned. */
export function missingEnv(get: (k: string) => string | undefined, names: readonly string[] = REQUIRED_ENV): string[] {
  return names.filter((k) => !get(k));
}

/**
 * GET /health: the worker's own state, nothing else. No task contents, company ids
 * or env values leave the process. 503 while the worker cannot do its job, so a
 * Railway healthcheck or uptime monitor sees it.
 */
export function healthHandler(status: WorkerStatus, info: { llm: "configured" | "not_configured"; complexFallback: "ollama" | "none" }, analytics?: AnalyticsStatus, seoAutopilot?: AutopilotStatus) {
  return (req: Request): Response => {
    const path = new URL(req.url).pathname;
    if (req.method !== "GET" || (path !== "/health" && path !== "/")) return new Response("not found", { status: 404 });
    const ok = status.state === "idle" || status.state === "working" || status.state === "starting";
    const body = {
      service: "growth-os",
      state: status.state,
      worker: status.worker,
      started_at: status.started_at,
      last_poll_at: status.last_poll_at,
      tasks_processed: status.tasks_processed,
      last_task_status: status.last_task?.status ?? null,
      last_error: status.last_error,
      llm: info.llm,
      complex_fallback: info.complexFallback,
      // Company ids and per-company errors stay internal; only the sync state is public.
      analytics: analytics ? { state: analytics.state, last_run_at: analytics.last_run_at, connections_synced: analytics.connections_synced } : null,
      seo_autopilot: seoAutopilot ? { state: seoAutopilot.state, last_check_at: seoAutopilot.last_check_at, rounds_last_check: seoAutopilot.last_results.length } : null,
    };
    return new Response(JSON.stringify(body), { status: ok ? 200 : 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  };
}
