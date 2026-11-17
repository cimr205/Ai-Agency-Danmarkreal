// Dependency-free validators (shared by Deno and Vite, so no zod import).
import type { AgentProfile, SkillDef } from "./types.ts";
import { ACTION_LEVELS } from "./approval.ts";

export interface ValidationResult { ok: boolean; errors: string[] }

const SEMVER = /^\d+\.\d+\.\d+$/;

export function validateRegistry(
  profiles: AgentProfile[], skills: SkillDef[], externalIds: string[],
): ValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const p of profiles) {
    if (ids.has(p.id)) errors.push(`duplicate agent id ${p.id}`);
    ids.add(p.id);
  }
  const skillIds = new Set<string>();
  for (const s of skills) {
    if (skillIds.has(s.id)) errors.push(`duplicate skill id ${s.id}`);
    skillIds.add(s.id);
    if (!SEMVER.test(s.version)) errors.push(`skill ${s.id}: bad version ${s.version}`);
    if (s.status === "active" && s.procedure.some((x) => x.startsWith("DRAFT"))) errors.push(`skill ${s.id}: active but has a draft procedure`);
    for (const k of ["purpose", "activation", "testMethod", "failureHandling", "escalation", "maintainer"] as const) {
      if (!s[k]) errors.push(`skill ${s.id}: missing ${k}`);
    }
    if (!ids.has(s.agentId)) errors.push(`skill ${s.id}: unknown agent ${s.agentId}`);
  }
  const ext = new Set(externalIds);
  for (const p of profiles) {
    if (p.reportsTo && !ids.has(p.reportsTo)) errors.push(`${p.id}: reportsTo unknown ${p.reportsTo}`);
    for (const s of p.projectSkills) if (!skillIds.has(s)) errors.push(`${p.id}: unknown skill ${s}`);
    for (const s of p.externalSkills) if (!ext.has(s)) errors.push(`${p.id}: unknown external skill ${s}`);
    for (const a of p.allowedActions) {
      if (!(a in ACTION_LEVELS)) errors.push(`${p.id}: unknown action ${a}`);
      if (p.approvalRequirements[a] !== ACTION_LEVELS[a]) errors.push(`${p.id}: approval level for ${a} differs from catalogue`);
      if ((ACTION_LEVELS[a] ?? 3) === 3) errors.push(`${p.id}: Level 3 action ${a} may never be an allowed autonomous action`);
    }
    if (p.kind === "specialist") {
      if (!p.verifierId || !ids.has(p.verifierId)) errors.push(`${p.id}: no verifier subagent`);
      if (p.maxAutonomousLevel > 1) errors.push(`${p.id}: specialists may act autonomously only up to Level 1`);
    }
    if (p.evaluationScore !== null) errors.push(`${p.id}: evaluationScore must be measured, not configured`);
    if (p.budget.usdPerTask <= 0 || p.budget.usdPerDay < p.budget.usdPerTask) errors.push(`${p.id}: inconsistent budget`);
  }
  return { ok: errors.length === 0, errors };
}

// ── Agent report (masterprompt §10) ─────────────────────────────────────────

export interface AgentReport {
  agent_id: string;
  task_id: string;
  department: string;
  status: "completed" | "failed" | "inconclusive" | "blocked";
  objective: string;
  skills_used: string[];
  model_used: string | null;
  actions_performed: { action: string; level: number; at: string; result: string }[];
  evidence: { kind: string; ref: string; value: unknown }[];
  before_metrics: Record<string, number | string | null>;
  after_metrics: Record<string, number | string | null>;
  cost: { tokens: number | null; estimated_usd: number | null; actual_usd: number | null };
  verification: { status: "pending" | "verified" | "discrepancy" | "inconclusive"; findings: string[] };
  learning: { observed_issue: string | null; candidate_improvement: string | null; outcome: "new_learning" | "method_confirmed" | "problem_documented" | "improvement_proposed" | null };
  recommendation: string;
  requires_approval: boolean;
}

const isStr = (v: unknown) => typeof v === "string";
const isNumOrNull = (v: unknown) => v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);

export function validateAgentReport(r: unknown): ValidationResult {
  const errors: string[] = [];
  const o = r as Record<string, unknown>;
  if (!o || typeof o !== "object") return { ok: false, errors: ["not an object"] };
  for (const k of ["agent_id", "task_id", "department", "objective", "recommendation"]) if (!isStr(o[k])) errors.push(`${k} must be a string`);
  if (!["completed", "failed", "inconclusive", "blocked"].includes(o.status as string)) errors.push("status invalid");
  if (!(o.model_used === null || isStr(o.model_used))) errors.push("model_used must be string or null");
  if (!Array.isArray(o.skills_used) || !(o.skills_used as unknown[]).every(isStr)) errors.push("skills_used must be string[]");
  if (!Array.isArray(o.actions_performed)) errors.push("actions_performed must be an array");
  if (!Array.isArray(o.evidence)) errors.push("evidence must be an array");
  for (const k of ["before_metrics", "after_metrics"]) {
    const m = o[k];
    if (!m || typeof m !== "object" || Array.isArray(m)) errors.push(`${k} must be an object`);
  }
  const c = o.cost as Record<string, unknown> | undefined;
  if (!c || !isNumOrNull(c.tokens) || !isNumOrNull(c.estimated_usd) || !isNumOrNull(c.actual_usd)) errors.push("cost fields must be non-negative numbers or null");
  const v = o.verification as Record<string, unknown> | undefined;
  if (!v || !["pending", "verified", "discrepancy", "inconclusive"].includes(v.status as string) || !Array.isArray(v.findings)) errors.push("verification invalid");
  const l = o.learning as Record<string, unknown> | undefined;
  if (!l || !(l.observed_issue === null || isStr(l.observed_issue)) || !(l.candidate_improvement === null || isStr(l.candidate_improvement))) errors.push("learning invalid");
  if (typeof o.requires_approval !== "boolean") errors.push("requires_approval must be boolean");
  if (o.status === "completed" && Array.isArray(o.evidence) && o.evidence.length === 0) errors.push("a completed report needs evidence");
  return { ok: errors.length === 0, errors };
}
