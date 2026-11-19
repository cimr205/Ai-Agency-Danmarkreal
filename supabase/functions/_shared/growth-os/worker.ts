// The Growth OS worker: claims queued tasks (lease + SKIP LOCKED in SQL), runs them
// through the engine and finishes them. Used by the long-running Railway service
// (growth-os/service/main.ts). IDLE is a normal state: when the queue is empty the
// loop sleeps and spends nothing.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { runTask, type EngineDeps, type GrowthTask } from "./engine.ts";
import { SupabaseGrowthStore } from "./supabase-store.ts";
import type { GatewayConfig } from "./openrouter.ts";
import { runOpportunities } from "./seo/opportunities-runner.ts";
import { closeStaleRuns, hasRunningRun, runAutopilot, type SiteRow } from "./seo/autopilot.ts";
import { DEFAULT_FREE_MODELS } from "./seo/free-llm.ts";

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface WorkResult { task_id: string; status: string; lease_kept?: boolean; error?: string }

export interface WorkerDeps {
  db: Db;
  worker: string;
  leaseSeconds: number;
  gateway: () => GatewayConfig | null;
  /** Overridable for tests; defaults to the real engine. */
  run?: (task: GrowthTask, deps: EngineDeps) => ReturnType<typeof runTask>;
  runOpportunities?: typeof runOpportunities;
  runAutopilot?: typeof runAutopilot;
  /** Free OpenRouter models for the SEO autopilot (GROWTH_OS_SEO_FREE_MODELS). */
  freeModels?: string[];
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Schema missing (migration not applied): reported as such, never as "no work". */
export class NotInstalledError extends Error {}

function isMissingSchema(e: { message: string; code?: string }) {
  return e.code === "42P01" || e.code === "42883" || e.code === "PGRST202" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message);
}

/** Claims and runs one task. Returns null when the queue is empty. */
export async function workOne(d: WorkerDeps, companyId: string | null = null): Promise<WorkResult | null> {
  const { data, error } = await d.db.rpc("growth_claim_task", { _worker: d.worker, _lease_seconds: d.leaseSeconds, _company_id: companyId });
  if (error) {
    if (isMissingSchema(error)) throw new NotInstalledError(error.message);
    throw new Error(`claim: ${error.message}`);
  }
  const row = (data ?? [])[0];
  if (!row) return null;
  const task: GrowthTask = { id: row.id, companyId: row.company_id, agentId: row.agent_id, type: row.type, input: row.input ?? {}, budgetUsd: Number(row.budget_usd) };
  const store = new SupabaseGrowthStore(d.db, row.company_id);
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  try {
    // Each task type has its own executor; growth_executable() in SQL lists the same pairs.
    const res = task.type === "seo.opportunities"
      ? await (d.runOpportunities ?? runOpportunities)(d.db, task, { fetch: d.fetch ?? fetch, now: d.now ?? Date.now }).then((r) => ({ report: r.report, verification: r.verification, ceo: null }))
      : task.type === "seo.autopilot"
      ? await manualAutopilot(d, task)
      : await (d.run ?? runTask)(task, {
        store, gateway: d.gateway(), fetch: d.fetch ?? fetch,
        now: d.now ?? Date.now, sleep, newId: () => crypto.randomUUID(),
      });
    const { data: ok } = await d.db.rpc("growth_finish_task", {
      _task_id: task.id, _worker: d.worker, _status: res.report.status,
      _result: { report: res.report, verification: res.verification, ceo: res.ceo },
    });
    await d.db.from("growth_audit_log").insert({ company_id: task.companyId, actor_type: "agent", actor_id: task.agentId, event: "task.finished", subject_id: task.id, detail: { status: res.report.status, verification: res.verification.status, lease_kept: ok === true, worker: d.worker } });
    return { task_id: task.id, status: res.report.status, lease_kept: ok === true };
  } catch (e) {
    const msg = (e as Error).message;
    await d.db.rpc("growth_finish_task", { _task_id: task.id, _worker: d.worker, _status: msg.includes("no executor") ? "blocked" : "failed", _result: null, _error: msg });
    await d.db.from("growth_audit_log").insert({ company_id: task.companyId, actor_type: "agent", actor_id: task.agentId, event: "task.error", subject_id: task.id, detail: { error: msg, worker: d.worker } });
    return { task_id: task.id, status: "failed", error: msg };
  }
}

/** A manual "run now" of the SEO autopilot (the hourly schedule lives in seo/autopilot.ts). */
async function manualAutopilot(d: WorkerDeps, task: GrowthTask) {
  const now = d.now ?? Date.now;
  const { data: site, error } = await d.db.from("growth_seo_sites").select("*").eq("company_id", task.companyId).maybeSingle();
  if (error) throw new Error(`seo site: ${error.message}`);
  const blocked = (reason: string) => ({ report: { status: "blocked", reason }, verification: { status: "inconclusive" as const, findings: [reason] }, ceo: null });
  if (!site) return blocked("the SEO autopilot is not set up for this company");
  await closeStaleRuns(d.db, task.companyId, now());
  if (await hasRunningRun(d.db, task.companyId)) return blocked("a round is already running");
  const r = await (d.runAutopilot ?? runAutopilot)(d.db, site as SiteRow, "manual", {
    fetch: d.fetch ?? fetch, now, gateway: d.gateway, freeModels: d.freeModels ?? DEFAULT_FREE_MODELS,
  }, task.id);
  const report = { status: r.status === "ok" ? "completed" : "failed", agent: "seo-agent", skill: "seo-autopilot@1.0.0", run_id: r.run_id, summary: r.summary, score: r.score, llm_calls: r.llm_calls, note: "Drafts wait for human approval; nothing was published." };
  // The crawl checks are deterministic and stored row by row; the round is verified when its run row closed cleanly.
  return { report, verification: { status: r.status === "ok" ? "verified" as const : "inconclusive" as const, findings: r.error ? [r.error] : [] }, ceo: null };
}

export type WorkerState = "starting" | "idle" | "working" | "not_installed" | "error" | "stopping";

export interface WorkerStatus {
  state: WorkerState;
  worker: string;
  started_at: string;
  last_poll_at: string | null;
  tasks_processed: number;
  last_task: WorkResult | null;
  last_error: string | null;
}

/**
 * Polls the queue until `signal` aborts. Works tasks back-to-back while there are any,
 * then sleeps `pollMs`. Errors back off up to `maxBackoffMs` and never crash the loop.
 * A task in progress is always finished before the loop stops.
 */
export async function runLoop(d: WorkerDeps, opts: { pollMs: number; maxBackoffMs: number; signal: AbortSignal; status: WorkerStatus }) {
  const now = d.now ?? Date.now;
  const wait = (ms: number) => new Promise<void>((resolve) => {
    if (opts.signal.aborted) return resolve();
    const t = setTimeout(() => { opts.signal.removeEventListener("abort", stop); resolve(); }, ms);
    const stop = () => { clearTimeout(t); resolve(); };
    opts.signal.addEventListener("abort", stop, { once: true });
  });
  let backoff = opts.pollMs;
  while (!opts.signal.aborted) {
    opts.status.last_poll_at = new Date(now()).toISOString();
    try {
      opts.status.state = "working";
      const r = await workOne(d);
      if (r) {
        opts.status.tasks_processed++;
        opts.status.last_task = r;
        opts.status.last_error = null;
        backoff = opts.pollMs;
        continue; // more work may be queued
      }
      opts.status.state = "idle";
      opts.status.last_error = null;
      backoff = opts.pollMs;
    } catch (e) {
      opts.status.state = e instanceof NotInstalledError ? "not_installed" : "error";
      opts.status.last_error = (e as Error).message;
      backoff = Math.min(opts.maxBackoffMs, backoff * 2);
    }
    await wait(backoff);
  }
  opts.status.state = "stopping";
}
