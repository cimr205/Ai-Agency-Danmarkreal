/// <reference types="node" />
/**
 * LIVE Mastra inference battery against a real local open-weight model
 * (Ollama, OpenAI-compatible endpoint). Unlike verify.ts (mock only), this
 * script calls a REAL model and reports measured latency + quality per area.
 *
 * It only ever runs when LOCAL_LLM_BASE_URL + LOCAL_LLM_MODEL are set. It makes
 * NO database writes and NO external sends — it exercises the MODEL + Mastra
 * Agent wiring (reasoning, Danish, structured JSON, tool-calling). Department
 * "agents" here are thin Mastra Agents given department instructions; the real
 * propose-only department modules are unit-tested separately and are driven by
 * the same model wiring.
 *
 * Run (from worktree root):
 *   LOCAL_LLM_BASE_URL=http://localhost:11434/v1 \
 *   LOCAL_LLM_MODEL=qwen3.5:2b LOCAL_LLM_API_KEY=ollama \
 *   node src/mastra/live-verify.ts
 */
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { mastra } from "./index.ts";
import { createDiagnosticAgent } from "./agents/diagnostic-agent.ts";
import { liveModel, liveModelConfig } from "./model.ts";

type StepResult = {
  step: string;
  ok: boolean;
  ms: number;
  note: string;
  sample?: string;
};

const results: StepResult[] = [];

async function timed(step: string, fn: () => Promise<{ ok: boolean; note: string; sample?: string }>) {
  const t0 = Date.now();
  try {
    const r = await fn();
    results.push({ step, ok: r.ok, ms: Date.now() - t0, note: r.note, sample: r.sample });
  } catch (err) {
    results.push({ step, ok: false, ms: Date.now() - t0, note: `ERROR: ${(err as Error).message}` });
  }
}

function textOf(res: unknown): string {
  const t = (res as { text?: unknown }).text;
  return typeof t === "string" ? t : String(t ?? "");
}

async function main() {
  const cfg = liveModelConfig();
  if (!cfg) {
    console.log(JSON.stringify({ liveInference: "NOT TESTED (no LOCAL_LLM_BASE_URL/MODEL)" }, null, 2));
    process.exit(2);
  }
  const model = liveModel(cfg)!;
  console.error(`[live-verify] model=${cfg.model} endpoint=${cfg.baseURL}`);

  // 0. Registry loads + diagnostic agent registered (mock-backed, structural).
  await timed("registry-loads", async () => ({
    ok: Boolean(mastra) && Boolean(mastra.getAgent("diagnostic")),
    note: "Mastra registry constructed and diagnostic agent registered",
  }));

  // 1. Diagnostic ping through the LIVE model.
  await timed("live-diagnostic-ping", async () => {
    const agent = createDiagnosticAgent(model);
    const res = await agent.generate("Reply with exactly one word: pong", {
      modelSettings: { temperature: 0, maxOutputTokens: 20 },
    });
    const text = textOf(res).toLowerCase();
    return { ok: text.includes("pong"), note: `reply="${textOf(res).trim().slice(0, 60)}"`, sample: textOf(res).trim() };
  });

  // 2. CRM — structured JSON lead prioritization (parse + validate).
  await timed("crm-structured-json", async () => {
    const agent = new Agent({
      id: "crm-live", name: "crm-live",
      instructions: "You are a CRM sales assistant. Output ONLY valid minified JSON, no prose, no markdown fences.",
      model,
    });
    const res = await agent.generate(
      'Rank these leads by priority (highest first). Leads: ' +
      '[{"id":"a","company":"Novo","budget":500000,"stage":"proposal"},' +
      '{"id":"b","company":"Kiosk","budget":2000,"stage":"new"},' +
      '{"id":"c","company":"Maersk","budget":300000,"stage":"negotiation"}]. ' +
      'Return JSON: {"ranked":[{"id":string,"reason":string}]} with all 3 ids.',
      { modelSettings: { temperature: 0, maxOutputTokens: 220 } },
    );
    const raw = textOf(res).replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw) as { ranked: { id: string }[] };
    const ids = parsed.ranked.map((r) => r.id);
    const hasAll = ["a", "b", "c"].every((i) => ids.includes(i));
    const topReasonable = ids[0] === "a" || ids[0] === "c"; // big budgets, late stage
    return {
      ok: hasAll && topReasonable,
      note: `valid JSON parsed, order=[${ids.join(",")}], top=${ids[0]} (expected a or c)`,
      sample: raw.slice(0, 160),
    };
  });

  // 3. Marketing — Danish short LinkedIn draft.
  await timed("marketing-danish-draft", async () => {
    const agent = new Agent({
      id: "mkt-live", name: "mkt-live",
      instructions: "Du er en dansk marketing-assistent. Skriv kort, professionelt dansk. Ingen engelsk.",
      model,
    });
    const res = await agent.generate(
      "Skriv et LinkedIn-opslag på max 3 sætninger om en dansk AI-bureau, der hjælper SMV'er med automatisering.",
      { modelSettings: { temperature: 0.3, maxOutputTokens: 160 } },
    );
    const t = textOf(res);
    // crude Danish signal: contains Danish-specific letters or common words
    const danish = /[æøå]/i.test(t) || /\b(og|til|med|for|virksomhed|hjælper|danske?)\b/i.test(t);
    return { ok: danish && t.trim().length > 20, note: `danish=${danish}, len=${t.trim().length}`, sample: t.trim().slice(0, 200) };
  });

  // 4. Finance — factual reasoning (which invoice is overdue).
  await timed("finance-factual-reasoning", async () => {
    const agent = new Agent({
      id: "fin-live", name: "fin-live",
      instructions: "You are a finance assistant. Answer with the single invoice id only.",
      model,
    });
    const res = await agent.generate(
      'Today is 2026-10-20. Which invoice is overdue? ' +
      'INV-1 due 2026-11-30 (unpaid). INV-2 due 2026-09-15 (unpaid). ' +
      'Answer with just the id.',
      { modelSettings: { temperature: 0, maxOutputTokens: 30 } },
    );
    const t = textOf(res);
    return { ok: /INV-2/i.test(t) && !/INV-1/i.test(t.replace(/INV-2/ig, "")), note: `answer="${t.trim().slice(0, 40)}" (expected INV-2)`, sample: t.trim() };
  });

  // 5. HR — find the unassigned shift.
  await timed("hr-reasoning", async () => {
    const agent = new Agent({
      id: "hr-live", name: "hr-live",
      instructions: "You are an HR scheduling assistant. Answer with the shift id only.",
      model,
    });
    const res = await agent.generate(
      'Which shift has no employee assigned? ' +
      'S1 -> employee E7. S2 -> (none). S3 -> employee E3. Answer with just the shift id.',
      { modelSettings: { temperature: 0, maxOutputTokens: 30 } },
    );
    const t = textOf(res);
    return { ok: /S2/i.test(t), note: `answer="${t.trim().slice(0, 40)}" (expected S2)`, sample: t.trim() };
  });

  // 6. Tool-calling — does the model invoke a provided tool?
  await timed("tool-calling", async () => {
    let toolCalled = false;
    const leadCount = createTool({
      id: "get_lead_count",
      description: "Returns the number of CRM leads for the current company.",
      inputSchema: z.object({ status: z.string().optional() }),
      outputSchema: z.object({ count: z.number() }),
      execute: async () => { toolCalled = true; return { count: 42 }; },
    });
    const agent = new Agent({
      id: "tool-live", name: "tool-live",
      instructions: "You are a CRM assistant. When asked how many leads exist, you MUST call the get_lead_count tool. Then state the number.",
      model,
      tools: { get_lead_count: leadCount },
    });
    const res = await agent.generate("How many leads do we have? Use your tool.", {
      modelSettings: { temperature: 0, maxOutputTokens: 160 },
    });
    const t = textOf(res);
    return { ok: toolCalled, note: `toolInvoked=${toolCalled}, mentions42=${/42/.test(t)}`, sample: t.trim().slice(0, 120) };
  });

  // Report
  const pass = results.filter((r) => r.ok).length;
  console.log(JSON.stringify({
    model: cfg.model,
    endpoint: cfg.baseURL,
    summary: `${pass}/${results.length} live steps passed`,
    results,
  }, null, 2));
  // Exit non-zero only if the core live inference (ping) failed.
  const ping = results.find((r) => r.step === "live-diagnostic-ping");
  process.exit(ping && ping.ok ? 0 : 1);
}

main().catch((err) => { console.error("LIVE_VERIFY_ERROR:", err); process.exit(1); });
