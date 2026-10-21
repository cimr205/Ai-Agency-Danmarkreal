/// <reference types="node" />
/**
 * Shared, configurable model router for AI Agency Danmark's Mastra layer.
 *
 * Every department (CRM, Marketing, Finance, HR, Dashboard) resolves its model
 * through this router by TASK COMPLEXITY rather than hardcoding a model. This
 * keeps the local Qwen3.5:2B strictly behind an env flag and NEVER the global
 * default.
 *
 * Policy (deliberate):
 *   - `diagnostic` / `simple`  → may use the local small model (2B) when it is
 *     explicitly enabled; otherwise a stronger model if configured; diagnostic
 *     always has a deterministic MOCK fallback so it works offline/in CI.
 *   - `complex`                → requires a `standard`/`advanced` model. The
 *     local small model (2B) is NOT eligible. If no stronger model is
 *     configured, the router returns a typed **BLOCKED** result — it must never
 *     silently downgrade a complex decision to 2B.
 *
 * No model is ever hardcoded: all endpoints/keys come from env. Nothing here
 * writes to a database or calls an external service at construction time — it
 * only builds AI-SDK model objects (lazy; network happens on generate()).
 *
 * This router does NOT change the Action Registry, approvals, RLS, tenant
 * isolation or audit — those remain enforced server-side exactly as before.
 * The router only decides WHICH language model a (future) agent reasons with.
 */
import type { LanguageModel } from "ai";
import { mockModel, liveModel, type LiveModelConfig } from "./model.ts";

export type Complexity = "diagnostic" | "simple" | "complex";
export type ModelClass = "small" | "standard" | "advanced";

const CLASS_RANK: Record<ModelClass, number> = { small: 1, standard: 2, advanced: 3 };

/** Minimum model class required per complexity. `complex` excludes `small` on
 * purpose: the local 2B must never silently handle complex decisions. */
export const MIN_CLASS: Record<Complexity, ModelClass> = {
  diagnostic: "small",
  simple: "small",
  complex: "standard",
};

export interface ModelSlot {
  modelClass: ModelClass;
  config: LiveModelConfig;
  /** reasoning_effort to pass; "none" for Qwen thinking models, "" to leave untouched. */
  reasoningEffort: string;
  source: string;
}

export type ModelResolution =
  | {
      status: "ok";
      model: LanguageModel;
      modelId: string;
      modelClass: ModelClass;
      complexity: Complexity;
      source: string;
    }
  | { status: "blocked"; complexity: Complexity; reason: string };

type Env = Record<string, string | undefined>;

function isTruthy(v: string | undefined): boolean {
  return v !== undefined && ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function readConfig(env: Env, prefix: string): LiveModelConfig | null {
  const baseURL = env[`${prefix}_BASE_URL`];
  const model = env[`${prefix}_MODEL`];
  if (!baseURL || !model) return null;
  return { baseURL, model, apiKey: env[`${prefix}_API_KEY`] ?? "" };
}

/**
 * Builds the registered model slots from env.
 *
 * - `MASTRA_ADVANCED_LLM_*`  → class `advanced` (e.g. a hosted 70B / frontier model or a gateway).
 * - `MASTRA_STANDARD_LLM_*`  → class `standard` (e.g. a self-hosted 7B–14B OSS model).
 * - `LOCAL_LLM_*`            → class `small`, ONLY when `MASTRA_ENABLE_LOCAL_SMALL` is truthy.
 *
 * Each slot may set `<PREFIX>_REASONING_EFFORT`. For the local small (Qwen) the
 * default is "none" (thinking off); standard/advanced default to "" (untouched).
 */
export function configuredSlots(env: Env = process.env): ModelSlot[] {
  const slots: ModelSlot[] = [];

  const adv = readConfig(env, "MASTRA_ADVANCED_LLM");
  if (adv) {
    slots.push({ modelClass: "advanced", config: adv, reasoningEffort: env.MASTRA_ADVANCED_LLM_REASONING_EFFORT ?? "", source: "MASTRA_ADVANCED_LLM" });
  }

  const std = readConfig(env, "MASTRA_STANDARD_LLM");
  if (std) {
    slots.push({ modelClass: "standard", config: std, reasoningEffort: env.MASTRA_STANDARD_LLM_REASONING_EFFORT ?? "", source: "MASTRA_STANDARD_LLM" });
  }

  // Local small (2B) is gated behind an explicit flag so it can never be a
  // silent global default.
  if (isTruthy(env.MASTRA_ENABLE_LOCAL_SMALL)) {
    const small = readConfig(env, "LOCAL_LLM");
    if (small) {
      slots.push({ modelClass: "small", config: small, reasoningEffort: env.LOCAL_LLM_REASONING_EFFORT ?? "none", source: "LOCAL_LLM(flagged)" });
    }
  }

  return slots;
}

/**
 * Resolves a language model for the given complexity. Returns `{status:"ok"}`
 * with a built model, or `{status:"blocked"}` with a precise reason. Never
 * downgrades a `complex` task to the local small model.
 */
export function resolveModel(complexity: Complexity, env: Env = process.env): ModelResolution {
  const minRank = CLASS_RANK[MIN_CLASS[complexity]];
  const slots = configuredSlots(env);
  const eligible = slots.filter((s) => CLASS_RANK[s.modelClass] >= minRank);

  if (eligible.length > 0) {
    // complex → strongest first; diagnostic/simple → cheapest eligible first
    // (so the strong model is reserved for complex work).
    const preferHigh = complexity === "complex";
    eligible.sort((a, b) =>
      preferHigh
        ? CLASS_RANK[b.modelClass] - CLASS_RANK[a.modelClass]
        : CLASS_RANK[a.modelClass] - CLASS_RANK[b.modelClass],
    );
    const chosen = eligible[0];
    const model = liveModel(chosen.config, { reasoningEffort: chosen.reasoningEffort })!;
    return {
      status: "ok",
      model,
      modelId: chosen.config.model,
      modelClass: chosen.modelClass,
      complexity,
      source: chosen.source,
    };
  }

  // Nothing eligible.
  if (complexity === "diagnostic") {
    // Diagnostics must always work — deterministic mock, no network/creds.
    return { status: "ok", model: mockModel(), modelId: "mock", modelClass: "small", complexity, source: "mock" };
  }

  const haveSmallOnly = slots.length > 0 && slots.every((s) => s.modelClass === "small");
  const reason = complexity === "complex"
    ? (haveSmallOnly
        ? "Complex task BLOCKED: only the local small model (2B) is available, and 2B is not eligible for complex decisions. Configure MASTRA_STANDARD_LLM_* or MASTRA_ADVANCED_LLM_* (a stronger OSS or gateway model). No silent downgrade to 2B."
        : "Complex task BLOCKED: no standard/advanced model configured. Set MASTRA_STANDARD_LLM_BASE_URL/_MODEL (and optionally MASTRA_ADVANCED_LLM_*).")
    : "Simple task BLOCKED: no model configured. Enable the local small model via MASTRA_ENABLE_LOCAL_SMALL=1 (+ LOCAL_LLM_BASE_URL/_MODEL) or configure MASTRA_STANDARD_LLM_*.";
  return { status: "blocked", complexity, reason };
}

/**
 * Default mapping of department task kinds → complexity. Departments import
 * this (or override it) so routing is consistent across CRM/Marketing/Finance/
 * HR/Dashboard. Simple, cheap tasks → `simple`; multi-factor decisions,
 * strategy, forecasting, cross-entity reasoning → `complex`.
 */
export const DEFAULT_TASK_COMPLEXITY: Record<string, Complexity> = {
  "diagnostic": "diagnostic",
  // CRM
  "crm.lead.prioritize": "simple",
  "crm.email.draft": "simple",
  "crm.deal.strategy": "complex",
  // Marketing
  "marketing.post.draft": "simple",
  "marketing.campaign.strategy": "complex",
  // Finance
  "finance.invoice.remind": "simple",
  "finance.forecast": "complex",
  // HR
  "hr.roster.suggest": "simple",
  "hr.capacity.plan": "complex",
  // Dashboard
  "dashboard.summary": "simple",
  "dashboard.insights": "complex",
};

/** Resolve a model for a known task kind using the default complexity map. */
export function resolveModelForTask(taskKind: string, env: Env = process.env): ModelResolution {
  const complexity = DEFAULT_TASK_COMPLEXITY[taskKind] ?? "complex"; // unknown → treat as complex (safe: won't silently use 2B)
  return resolveModel(complexity, env);
}
