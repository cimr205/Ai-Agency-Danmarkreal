import type { ApprovalLevel, Approver } from "./types.ts";

/**
 * Action catalogue (masterprompt §16). An agent can only perform actions listed
 * here; anything unknown is treated as Level 3. The SQL side mirrors this in
 * public.growth_action_level() and is the authority: the TypeScript copy only
 * lets the UI and planner explain it. A test keeps both in sync.
 */
export const ACTION_LEVELS: Record<string, ApprovalLevel> = {
  // Level 0: read only
  "read.public_url": 0,
  "read.tenant_data": 0,
  "analyze": 0,
  "report.create": 0,
  // Level 1: safe internal
  "draft.create": 1,
  "proposal.create": 1,
  "learning.record": 1,
  "skill.candidate.create": 1,
  "eval.run_isolated": 1,
  // Level 2: controlled change
  "experiment.start_controlled": 2,
  "config.internal_update": 2,
  "skill.activate": 2,
  "model_routing.change": 2,
  // Level 3: business critical
  "deploy.production": 3,
  "ads.budget_change": 3,
  "content.publish": 3,
  "customer.message_send": 3,
  "access.grant": 3,
  "billing.change": 3,
  "data.delete_or_export": 3,
  "integration.install_external_code": 3,
  "budget.increase": 3,
};

export function actionLevel(action: string): ApprovalLevel {
  return ACTION_LEVELS[action] ?? 3;
}

/** Level 0–1 run without approval inside budget; 2 needs the delegated (CEO or human) approval; 3 needs a human. */
export function requiredApprover(level: ApprovalLevel): Approver {
  if (level <= 1) return "none";
  if (level === 2) return "department_ceo";
  return "human";
}

/**
 * Stable JSON (sorted keys) so an approval is bound to the exact payload: a
 * changed payload has a different hash and needs a new approval.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export async function payloadHash(action: string, payload: unknown): Promise<string> {
  const data = new TextEncoder().encode(`${action}\n${canonicalJson(payload)}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
