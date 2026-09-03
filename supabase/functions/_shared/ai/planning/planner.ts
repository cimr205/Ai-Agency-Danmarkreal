import { OllamaClient } from "../model/ollama.client.ts";
import { PlanSchema, type Plan } from "./plan.schema.ts";
import { plannerPrompt } from "../prompts/planner.ts";
import type { Capability } from "../capabilities/capability.types.ts";
import type { SupportedLanguage } from "../model/model.types.ts";

export interface PlannerResult {
  ok: boolean;
  plan: Plan | null;
  error: string | null;
}

export async function generatePlan(
  message: string,
  language: SupportedLanguage,
  candidates: Capability[],
  memoryMessages: { role: "user" | "assistant"; content: string }[],
): Promise<PlannerResult> {
  if (candidates.length === 0) {
    return {
      ok: true,
      plan: { language, intent: "no_matching_capability", requiresClarification: false, clarificationQuestion: null, steps: [] },
      error: null,
    };
  }

  const candidateDescriptions = candidates
    .map((c) => `- ${c.id}: ${c.description} (risk=${c.risk}, input=${JSON.stringify(zodShapeHint(c))})`)
    .join("\n");

  const result = await OllamaClient.structured(
    [
      { role: "system", content: plannerPrompt(candidateDescriptions) },
      ...memoryMessages,
      { role: "user", content: message },
    ],
    PlanSchema,
  );

  if (!result.ok || !result.data) return { ok: false, plan: null, error: result.error };
  return { ok: true, plan: result.data, error: null };
}

// Best-effort human-readable field hint from the Zod schema, without a
// full JSON-schema conversion dependency — keeps the prompt short.
function zodShapeHint(c: Capability): Record<string, string> {
  const shape = (c.inputSchema as unknown as { shape?: Record<string, unknown> }).shape;
  if (!shape) return {};
  return Object.fromEntries(Object.keys(shape).map((k) => [k, "…"]));
}
