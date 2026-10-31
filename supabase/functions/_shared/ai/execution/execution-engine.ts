import type { ValidatedStep } from "../planning/plan-validator.ts";
import type { ExecutionContext } from "./execution.types.ts";

export interface StepExecutionRecord {
  stepId: string;
  capability: string;
  provider: string;
  status: "completed" | "failed" | "requires_confirmation" | "requires_clarification";
  input: unknown;
  output: unknown;
  error: string | null;
  durationMs: number;
  clarificationQuestion?: string;
}

export type ExecutionOutcome =
  | { status: "completed"; records: StepExecutionRecord[] }
  | { status: "partial"; records: StepExecutionRecord[] }
  | { status: "failed"; records: StepExecutionRecord[] }
  | { status: "requires_confirmation"; records: StepExecutionRecord[]; pendingStep: ValidatedStep }
  | { status: "requires_clarification"; records: StepExecutionRecord[]; question: string };

function pickField(value: unknown, targetField: string): unknown {
  if (value == null || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (targetField in obj) return obj[targetField];
  if (/^(to|cc|bcc|email|recipient)/i.test(targetField) && "email" in obj) return obj.email;
  if (/id$/i.test(targetField) && "id" in obj) return obj.id;
  return undefined;
}

function resolveStepReferences(input: Record<string, unknown>, results: Map<string, unknown>): { resolved: Record<string, unknown>; ambiguous: string | null } {
  const resolved: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(input)) {
    if (typeof value === "string" && /^step_\d+$/.test(value)) {
      const prior = results.get(value);
      if (Array.isArray(prior)) {
        if (prior.length === 0) throw new Error(`Ingen resultat fra ${value} at bruge til ${field}`);
        if (prior.length > 1) return { resolved, ambiguous: `Jeg fandt ${prior.length} mulige match. Hvilken mener du?` };
        resolved[field] = pickField(prior[0], field) ?? prior[0];
      } else {
        resolved[field] = pickField(prior, field) ?? prior;
      }
    } else {
      resolved[field] = value;
    }
  }
  return { resolved, ambiguous: null };
}

// Runs the plan step-by-step. The LLM is never called again between
// steps — dependency resolution is pure code, which is what keeps
// multi-step plans fast. Stops and returns requires_confirmation the
// moment it reaches a step whose capability needs it, without executing
// that step or anything after it.
export async function executePlan(
  steps: ValidatedStep[],
  ctx: ExecutionContext,
  confirmedStepIds: Set<string> = new Set(),
): Promise<ExecutionOutcome> {
  const records: StepExecutionRecord[] = [];
  const results = new Map<string, unknown>();
  let anyFailed = false;

  for (const { step, capability, connection } of steps) {
    if (capability.requiresConfirmation && !confirmedStepIds.has(step.id)) {
      return { status: "requires_confirmation", records, pendingStep: { step, capability, connection } };
    }

    const started = Date.now();
    let resolvedInput: Record<string, unknown>;
    try {
      const { resolved, ambiguous } = resolveStepReferences(step.input, results);
      if (ambiguous) return { status: "requires_clarification", records, question: ambiguous };
      resolvedInput = resolved;
    } catch (e) {
      records.push({ stepId: step.id, capability: capability.id, provider: connection.provider, status: "failed", input: step.input, output: null, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started });
      anyFailed = true;
      break;
    }

    try {
      const parsed = capability.inputSchema.safeParse(resolvedInput);
      if (!parsed.success) throw new Error(`Resolved input invalid for ${capability.id}: ${parsed.error.message}`);
      const result = await capability.execute(ctx, parsed.data);
      const durationMs = Date.now() - started;
      if (!result.success) {
        records.push({ stepId: step.id, capability: capability.id, provider: connection.provider, status: "failed", input: resolvedInput, output: null, error: result.error ?? "Unknown error", durationMs });
        anyFailed = true;
        break; // never continue past a failed step and pretend later steps still make sense
      }
      results.set(step.id, result.data);
      records.push({ stepId: step.id, capability: capability.id, provider: connection.provider, status: "completed", input: resolvedInput, output: result.data, error: null, durationMs });
    } catch (e) {
      records.push({ stepId: step.id, capability: capability.id, provider: connection.provider, status: "failed", input: resolvedInput, output: null, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started });
      anyFailed = true;
      break;
    }
  }

  if (anyFailed) return { status: records.some((r) => r.status === "completed") ? "partial" : "failed", records };
  return { status: "completed", records };
}
