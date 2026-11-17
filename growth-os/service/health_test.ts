import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { healthHandler, LLM_ENV, missingEnv } from "./health.ts";
import type { WorkerStatus } from "../../supabase/functions/_shared/growth-os/worker.ts";

const base: WorkerStatus = { state: "idle", worker: "railway-x", started_at: "2026-11-15T00:00:00.000Z", last_poll_at: null, tasks_processed: 0, last_task: null, last_error: null };
const info = { llm: "configured" as const, complexFallback: "none" as const };

Deno.test("health is 200 when idle and never echoes env values", async () => {
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "secret-value-should-not-leak");
  const res = healthHandler({ ...base }, info)(new Request("http://x/health"));
  assertEquals(res.status, 200);
  const text = await res.text();
  assert(!text.includes("secret-value"));
  assertEquals(JSON.parse(text).state, "idle");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
});

Deno.test("health is 503 when the migration is missing or env is incomplete", () => {
  assertEquals(healthHandler({ ...base, state: "not_installed" }, info)(new Request("http://x/health")).status, 503);
  assertEquals(healthHandler({ ...base, state: "error" }, info)(new Request("http://x/health")).status, 503);
});

Deno.test("only GET /health and / are served", () => {
  const h = healthHandler({ ...base }, info);
  assertEquals(h(new Request("http://x/run", { method: "POST" })).status, 404);
  assertEquals(h(new Request("http://x/health", { method: "POST" })).status, 404);
});

Deno.test("missingEnv names the absent variables only", () => {
  const env: Record<string, string> = { SUPABASE_URL: "https://x.supabase.co" };
  assertEquals(missingEnv((k) => env[k]), ["SUPABASE_SERVICE_ROLE_KEY"]);
  assertEquals(missingEnv((k) => env[k], LLM_ENV), ["LOCAL_LLM_BASE_URL", "LOCAL_LLM_MODEL", "LOCAL_LLM_API_KEY"]);
});
