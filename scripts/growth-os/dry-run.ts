// Runs one real SEO task end to end against a public URL with the in-memory
// store (no database writes). The LLM step runs only when LOCAL_LLM_* are set
// in the environment; otherwise the report says it was skipped.
// deno run --node-modules-dir=none --allow-read --allow-env --allow-net=<host>,openrouter.ai scripts/growth-os/dry-run.ts https://example.dk/
import { runTask } from "../../supabase/functions/_shared/growth-os/engine.ts";
import { MemoryStore } from "../../supabase/functions/_shared/growth-os/memory-store.ts";
import { gatewayConfigFromEnv } from "../../supabase/functions/_shared/growth-os/openrouter.ts";

const url = Deno.args[0];
if (!url) throw new Error("usage: dry-run.ts <url>");
const store = new MemoryStore(0.5);
const res = await runTask(
  { id: crypto.randomUUID(), companyId: "dry-run", agentId: "seo-agent", type: "seo.onpage_audit", input: { url, objective: "Dry run" }, budgetUsd: 0.05 },
  { store, gateway: gatewayConfigFromEnv((k) => Deno.env.get(k)), fetch, now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), newId: () => crypto.randomUUID() },
);
console.log(JSON.stringify({
  status: res.report.status,
  verification: res.verification,
  score: res.report.after_metrics.onpage_score,
  failing: res.report.evidence.filter((e) => e.kind === "seo_check" && (e.value as { status: string }).status !== "pass").map((e) => `${e.ref}: ${JSON.stringify((e.value as { value: unknown }).value)}`),
  model: res.report.model_used,
  cost: res.report.cost,
  learning: res.learning.outcome,
  ceo: res.ceo,
  phases: store.events.map((e) => `${e.phase}:${e.action}:${e.status}`),
}, null, 2));
