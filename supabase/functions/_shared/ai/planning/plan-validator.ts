import type { Plan, PlanStep } from "./plan.schema.ts";
import { CapabilityRegistry } from "../capabilities/capability-registry.ts";
import { PermissionEngine } from "../permissions/permission-engine.ts";
import { resolveConnection, type ResolvedConnection } from "../connections/connection-resolver.ts";
import type { ExecutionContext } from "../execution/execution.types.ts";
import type { Capability } from "../capabilities/capability.types.ts";

export interface ValidatedStep {
  step: PlanStep;
  capability: Capability;
  // Only the resolved variant ever reaches here — requires_connection
  // short-circuits validation below before a step is pushed to `validated`.
  connection: Extract<ResolvedConnection, { status: "resolved" }>;
}

export type ValidationResult =
  | { ok: true; steps: ValidatedStep[] }
  | { ok: false; reason: string; requiresConnection?: { capability: string; availableProviders: string[] } };

function hasCycle(steps: PlanStep[]): boolean {
  const graph = new Map(steps.map((s) => [s.id, s.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function dfs(id: string): boolean {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) if (dfs(dep)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return steps.some((s) => dfs(s.id));
}

/**
 * Runs every check from the spec before a plan is allowed anywhere near
 * execution: capability exists, was among the allowed candidates (never
 * something the model invented), input matches its schema, dependencies
 * exist and are acyclic, the user has permission, and — for anything
 * needing an external provider — a connection actually exists.
 */
export async function validatePlan(
  plan: Plan,
  allowedCandidateIds: Set<string>,
  ctx: ExecutionContext,
): Promise<ValidationResult> {
  if (plan.requiresClarification || plan.steps.length === 0) return { ok: true, steps: [] };

  const stepIds = new Set(plan.steps.map((s) => s.id));
  if (stepIds.size !== plan.steps.length) return { ok: false, reason: "Duplicate step ids in plan" };
  if (hasCycle(plan.steps)) return { ok: false, reason: "Circular dependency between steps" };

  const validated: ValidatedStep[] = [];
  for (const step of plan.steps) {
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) return { ok: false, reason: `Step ${step.id} depends on unknown step ${dep}` };
    }

    // §L: planner may only choose capabilities it was actually handed —
    // reject anything hallucinated, even if it happens to be a real
    // registered capability elsewhere in the system.
    if (!allowedCandidateIds.has(step.capability)) {
      return { ok: false, reason: `Capability ${step.capability} was not offered to the planner for this request` };
    }
    const capability = CapabilityRegistry.get(step.capability);
    if (!capability) return { ok: false, reason: `Capability ${step.capability} is not registered` };

    if (!PermissionEngine.canUse(capability, ctx.roles)) {
      return { ok: false, reason: `You do not have permission to use ${capability.id}` };
    }

    // Input validation is deferred for steps that reference an earlier
    // step's output (e.g. recipientFrom: "step_1") — the real value isn't
    // known until execution resolves it. Values NOT referencing a step
    // are validated now, so a malformed literal is rejected before any
    // execution starts rather than failing mid-plan.
    const literalInput = Object.fromEntries(
      Object.entries(step.input).filter(([, v]) => !(typeof v === "string" && /^step_\d+$/.test(v))),
    );
    const referencesStep = Object.keys(step.input).length !== Object.keys(literalInput).length;
    if (!referencesStep) {
      const parsed = capability.inputSchema.safeParse(step.input);
      if (!parsed.success) return { ok: false, reason: `Invalid input for ${capability.id}: ${parsed.error.message}` };
    }

    const connection = await resolveConnection(capability, ctx);
    if (connection.status === "requires_connection") {
      return { ok: false, reason: `No connected provider for ${capability.id}`, requiresConnection: { capability: connection.capability, availableProviders: connection.availableProviders } };
    }

    validated.push({ step, capability, connection });
  }

  return { ok: true, steps: validated };
}
