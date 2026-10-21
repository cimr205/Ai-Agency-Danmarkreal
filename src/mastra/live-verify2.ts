/// <reference types="node" />
/** Focused retry of the two weak spots (JSON strictness, tool-calling) on the
 * live model, with firmer prompts / unambiguous tool. Honest best-effort read. */
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { liveModel, liveModelConfig } from "./model.ts";

function textOf(res: unknown): string {
  const t = (res as { text?: unknown }).text;
  return typeof t === "string" ? t : String(t ?? "");
}

async function main() {
  const cfg = liveModelConfig();
  if (!cfg) { console.log("NOT CONFIGURED"); process.exit(2); }
  const model = liveModel(cfg)!;
  const out: Record<string, unknown> = {};

  // JSON retry — firmer instruction.
  {
    const t0 = Date.now();
    const agent = new Agent({
      id: "crm2", name: "crm2",
      instructions: "Output ONE single valid JSON object only. No markdown, no prose, no duplicate keys.",
      model,
    });
    const res = await agent.generate(
      'Return exactly: {"ranked":["id","id","id"]} ordered by priority (highest budget + latest stage first). ' +
      'Leads: a=Novo(500000,proposal), b=Kiosk(2000,new), c=Maersk(300000,negotiation).',
      { modelSettings: { temperature: 0, maxOutputTokens: 120 } },
    );
    const raw = textOf(res).replace(/```json|```/g, "").trim();
    let okJson = false, order: unknown = null;
    try { const p = JSON.parse(raw); order = p.ranked; okJson = Array.isArray(p.ranked) && p.ranked.length === 3; } catch { /* */ }
    out.json_retry = { ok: okJson, ms: Date.now() - t0, order, sample: raw.slice(0, 160) };
  }

  // Tool-calling retry — no-arg tool, firmer instruction.
  {
    const t0 = Date.now();
    let called = false;
    const countLeads = createTool({
      id: "count_leads",
      description: "Returns the total number of CRM leads. Takes no arguments.",
      inputSchema: z.object({}),
      outputSchema: z.object({ count: z.number() }),
      execute: async () => { called = true; return { count: 42 }; },
    });
    const agent = new Agent({
      id: "tool2", name: "tool2",
      instructions: "You MUST call count_leads to answer. Never ask the user questions. After the tool returns, state the number.",
      model,
      tools: { count_leads: countLeads },
    });
    const res = await agent.generate("How many leads are in the CRM in total?", {
      modelSettings: { temperature: 0, maxOutputTokens: 150 },
    });
    out.tool_retry = { ok: called, ms: Date.now() - t0, mentions42: /42/.test(textOf(res)), sample: textOf(res).trim().slice(0, 120) };
  }

  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
