import type { AgentProfile, ApprovalLevel, ModelPolicy, SpecialistDef } from "../types.ts";
import { ACTION_LEVELS } from "../approval.ts";
import { DEPARTMENTS, GLOBAL_CEO_ID, SPECIALISTS } from "./specialists.ts";
import { SKILLS } from "./skills.ts";

const SPECIALIST_ACTIONS = ["read.public_url", "read.tenant_data", "analyze", "report.create", "draft.create", "proposal.create", "learning.record", "skill.candidate.create"];
const VERIFIER_ACTIONS = ["read.public_url", "read.tenant_data", "analyze", "report.create", "eval.run_isolated"];
const CEO_ACTIONS = ["read.tenant_data", "analyze", "report.create", "proposal.create", "experiment.start_controlled", "skill.activate"];

function approvals(actions: string[]): Record<string, ApprovalLevel> {
  return Object.fromEntries(actions.map((a) => [a, ACTION_LEVELS[a] ?? 3]));
}

const SPECIALIST_MODEL: ModelPolicy = { plan: "simple", execute: "standard", verify: "verification", maxUsdPerCall: 0.02, denyDataCollection: true };
const VERIFIER_MODEL: ModelPolicy = { plan: "simple", execute: "verification", verify: "verification", maxUsdPerCall: 0.02, denyDataCollection: true };
const CEO_MODEL: ModelPolicy = { plan: "standard", execute: "complex", verify: "verification", maxUsdPerCall: 0.05, denyDataCollection: true };

function specialistProfile(sp: SpecialistDef): AgentProfile {
  const dept = DEPARTMENTS.find((d) => d.id === sp.department)!;
  const own = SKILLS.filter((s) => s.agentId === sp.id);
  return {
    id: sp.id, kind: "specialist", name: sp.name, department: sp.department, reportsTo: dept.ceoId,
    responsibility: sp.responsibility,
    externalSkills: sp.externalSkills,
    projectSkills: sp.skills,
    allowedTools: Array.from(new Set(own.flatMap((s) => s.tools))),
    modelPolicy: SPECIALIST_MODEL,
    dataSources: sp.dataSources,
    experimentMethod: "One hypothesis per task, a baseline measured before the change, a pre-declared metric and stop rule; INCONCLUSIVE when evidence is insufficient.",
    qualityCriteria: [
      `Moves or explains: ${sp.primaryKpi}`,
      "Every claim backed by evidence in the report",
      "Unknown values are null, never estimated as fact",
      "Passes independent verification",
    ],
    reportFormat: "growth-os.agent-report.v1",
    skillVersion: own.map((s) => `${s.id}@${s.version}`).join(", "),
    evaluationScore: null,
    budget: { usdPerTask: 0.05, usdPerDay: 0.5 },
    maxAutonomousLevel: 1,
    allowedActions: SPECIALIST_ACTIONS,
    approvalRequirements: approvals(SPECIALIST_ACTIONS),
    status: sp.status,
    verifierId: `${sp.id}-verifier`,
  };
}

function verifierProfile(sp: SpecialistDef): AgentProfile {
  const dept = DEPARTMENTS.find((d) => d.id === sp.department)!;
  return {
    id: `${sp.id}-verifier`, kind: "verifier", name: `${sp.code} Verifier`, department: sp.department, reportsTo: dept.ceoId,
    responsibility: `Independent critical review of ${sp.code} work: re-observes evidence, recomputes results, checks tests, data quality, cost, privacy and reproducibility. Cannot edit the specialist's output or the evaluation data.`,
    externalSkills: [],
    projectSkills: sp.skills.filter((s) => /verification|validation|evaluation/.test(s)),
    allowedTools: ["http.fetch_public", "html.parse", "read.tenant_data", "llm.openrouter"],
    modelPolicy: VERIFIER_MODEL,
    dataSources: sp.dataSources,
    experimentMethod: "Reproduce, do not trust: the same inputs must give the same deterministic result.",
    qualityCriteria: ["Every finding cites evidence", "Verdict is verified only when all checks reproduce", "Inconclusive when the source changed or is unreachable"],
    reportFormat: "growth-os.verification-report.v1",
    skillVersion: "verifier@1.0.0",
    evaluationScore: null,
    budget: { usdPerTask: 0.03, usdPerDay: 0.3 },
    maxAutonomousLevel: 1,
    allowedActions: VERIFIER_ACTIONS,
    approvalRequirements: approvals(VERIFIER_ACTIONS),
    status: sp.status,
  };
}

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: GLOBAL_CEO_ID, kind: "global_ceo", name: "Global CEO", department: null, reportsTo: null,
    responsibility: "Keeps the system on profitable customer growth: one commercial milestone, budget allocation across departments, stops low-value work, resolves conflicts, presents human approvals. Decision support only; cannot widen its own rights or bypass human approval.",
    externalSkills: [], projectSkills: [], allowedTools: ["read.tenant_data", "llm.openrouter"],
    modelPolicy: CEO_MODEL, dataSources: ["Department CEO reports", "growth_model_usage", "growth_budgets"],
    experimentMethod: "Compares departments on expected commercial effect per USD.",
    qualityCriteria: ["Prioritises outcomes over activity", "Reports data quality alongside results"],
    reportFormat: "growth-os.ceo-report.v1", skillVersion: "ceo@1.0.0", evaluationScore: null,
    budget: { usdPerTask: 0.1, usdPerDay: 0.5 }, maxAutonomousLevel: 1,
    allowedActions: CEO_ACTIONS, approvalRequirements: approvals(CEO_ACTIONS), status: "registered", // receives escalations; no autonomous Global CEO loop yet
  },
  ...DEPARTMENTS.map((d): AgentProfile => ({
    id: d.ceoId, kind: "department_ceo", name: `${d.name} CEO`, department: d.id, reportsTo: GLOBAL_CEO_ID,
    responsibility: `${d.mandate} Compares specialist and verifier reports, checks evidence quality and duplicate work, approves low-risk experiments within a ${d.ceoDelegatedUsdPerTask} USD delegated mandate, escalates the rest.`,
    externalSkills: [], projectSkills: [], allowedTools: ["read.tenant_data", "llm.openrouter"],
    modelPolicy: CEO_MODEL, dataSources: ["Specialist + verifier reports", "growth_tasks"],
    experimentMethod: "Approves only experiments with a baseline, metric and stop rule.",
    qualityCriteria: ["Evidence quality checked", "Duplicate work detected", "Escalates anything above its mandate"],
    reportFormat: "growth-os.ceo-report.v1", skillVersion: "ceo@1.0.0", evaluationScore: null,
    budget: { usdPerTask: 0.05, usdPerDay: 0.3 }, maxAutonomousLevel: 2,
    allowedActions: CEO_ACTIONS, approvalRequirements: approvals(CEO_ACTIONS),
    status: d.id === "search" ? "operational" : "registered",
  })),
  ...SPECIALISTS.map(specialistProfile),
  ...SPECIALISTS.map(verifierProfile),
];

export function profileById(id: string): AgentProfile | undefined {
  return AGENT_PROFILES.find((p) => p.id === id);
}
