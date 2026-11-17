// Growth OS shared types. Runtime-agnostic (Deno edge functions + Vite UI):
// no imports, no Deno/Node APIs.

export type DepartmentId = "search" | "experience" | "content" | "paid" | "growth";

/** Approval levels (masterprompt §16). */
export type ApprovalLevel = 0 | 1 | 2 | 3;

/** Who must approve a level: nobody, the department CEO agent (inside its delegated mandate), or a human. */
export type Approver = "none" | "department_ceo" | "global_ceo" | "human";

/** Task complexity drives the minimum model class (same policy as src/mastra/model-router.ts). */
export type TaskComplexity = "simple" | "standard" | "complex" | "verification";
export type ModelClass = "small" | "standard" | "advanced";

/**
 * operational: has a working end-to-end flow on this branch (tested).
 * registered:  profile + skill contracts exist; no executor yet. Must never be shown as working.
 */
export type AgentStatus = "operational" | "registered";

/** active: executable and tested. draft: contract only, no executor. */
export type SkillStatus = "active" | "draft" | "deprecated";

export interface DepartmentDef {
  id: DepartmentId;
  name: string;
  ceoId: string;
  mandate: string;
  /** Max USD the department CEO may approve for a single low-risk experiment without escalating. */
  ceoDelegatedUsdPerTask: number;
}

export interface SpecialistDef {
  id: string;          // e.g. "seo-agent"
  code: string;        // e.g. "SEO"
  number: number;      // 1..35
  name: string;
  department: DepartmentId;
  responsibility: string;
  primaryKpi: string;
  dataSources: string[];
  skills: string[];    // project skill ids
  externalSkills: string[]; // ids from the external manifest
  status: AgentStatus;
  /** True for 31–35: supplementary growth areas, not established acronyms (masterprompt §4 note). */
  supplementary?: boolean;
}

export interface ModelPolicy {
  /** Complexity per phase. The gateway resolves the actual model from the live OpenRouter catalogue. */
  plan: TaskComplexity;
  execute: TaskComplexity;
  verify: TaskComplexity;
  /** Max USD per single LLM call; the gateway refuses models whose worst-case cost exceeds it. */
  maxUsdPerCall: number;
  /** Data may be sent only to providers that do not train on prompts (OpenRouter `data_collection: deny`). */
  denyDataCollection: boolean;
}

export interface AgentProfile {
  id: string;
  kind: "specialist" | "verifier" | "department_ceo" | "global_ceo";
  name: string;
  department: DepartmentId | null;
  reportsTo: string | null;
  responsibility: string;
  externalSkills: string[];
  projectSkills: string[];
  allowedTools: string[];
  modelPolicy: ModelPolicy;
  dataSources: string[];
  experimentMethod: string;
  qualityCriteria: string[];
  reportFormat: "growth-os.agent-report.v1" | "growth-os.verification-report.v1" | "growth-os.ceo-report.v1";
  skillVersion: string;
  /** Evaluation score is measured, never configured: null until an evaluation run exists. */
  evaluationScore: null;
  budget: { usdPerTask: number; usdPerDay: number };
  /** Highest approval level this agent may *execute* without someone else's approval. */
  maxAutonomousLevel: ApprovalLevel;
  allowedActions: string[];
  approvalRequirements: Record<string, ApprovalLevel>;
  status: AgentStatus;
  verifierId?: string;
}

export interface SkillDef {
  id: string;
  agentId: string;
  version: string;
  status: SkillStatus;
  purpose: string;
  activation: string;
  inputs: string[];
  dataRequirements: string[];
  tools: string[];
  procedure: string[];
  outputs: string[];
  testMethod: string;
  failureHandling: string;
  securityLimits: string[];
  escalation: string;
  maxLevel: ApprovalLevel;
  maintainer: string;
}

export interface ExternalSkillDef {
  id: string;
  repo: string;
  commit: string;
  path: string;
  license: string;
  kind: "agent-skill" | "tool" | "sdk";
  status: "approved-reference" | "approved-tool" | "blocked" | "not-adopted";
  usedFor: string;
  findings: string[];
  verifiedAt: string;
}
