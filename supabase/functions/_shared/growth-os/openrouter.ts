// Growth OS LLM gateway. Every Growth OS model call goes through here.
//
// It sits on top of the platform's existing OpenRouter contract (LOCAL_LLM_*
// secrets, see ../aiConnection.ts) and adds what agents need: model choice
// per task complexity from the *live* OpenRouter catalogue (no model id is
// hard-coded), a worst-case cost check before every attempt, a budget ledger,
// timeouts, retries with exponential backoff, a fallback chain that stays
// inside the policy and budget, traceable request ids, token/cost accounting
// from OpenRouter's own usage numbers, structured-output validation and an
// optional short cache. Runtime-agnostic: fetch, clock and sleep are injected.
import type { ModelClass, TaskComplexity } from "./types.ts";
import { canonicalJson } from "./approval.ts";

export const MIN_CLASS: Record<TaskComplexity, ModelClass> = {
  simple: "small",
  standard: "standard",
  verification: "standard",
  complex: "advanced",
};
const RANK: Record<ModelClass, number> = { small: 1, standard: 2, advanced: 3 };

export interface CatalogModel {
  id: string;
  promptUsdPerToken: number;
  completionUsdPerToken: number;
  contextLength: number;
  supportsJson: boolean;
  /** Unix seconds the model was added to OpenRouter (0 when unknown); used to pick the newest match of a pattern. */
  created: number;
}

export interface GatewayConfig {
  chatEndpoint: string;     // …/chat/completions
  modelsEndpoint: string;   // …/models
  apiKey: string;
  /**
   * Owner-set policy: which catalogue models belong to which class, in order of
   * preference. An entry may end in `*` (e.g. `anthropic/claude-sonnet-*`): it
   * resolves to the NEWEST matching model in the live catalogue, so no version
   * is hard-coded and a retired model is never called.
   */
  classes: Partial<Record<ModelClass, string[]>>;
  /**
   * Providers allowed for `complex` tasks (owner decision 2026-11-14: hard tasks
   * run on Claude). A complex task never falls back outside these providers;
   * with none available it is BLOCKED.
   */
  complexProviders: string[];
  /**
   * Owner decision 2026-11-14: when no Claude model is available (or all of them
   * fail), complex tasks go to the self-hosted Ollama instance on Railway. It is
   * the ONLY fallback outside complexProviders. null = not configured → BLOCKED.
   */
  complexFallback: SelfHostedModel | null;
}

/** An OpenAI-compatible self-hosted endpoint (Ollama's /v1). No per-token price: cost is recorded as 0. */
export interface SelfHostedModel {
  chatEndpoint: string;
  apiKey: string;
  model: string;
  /** Ollama answers thinking models (e.g. Qwen3) with empty content unless reasoning is off. */
  reasoningEffort: string;
}

/** Reads GROWTH_OS_OLLAMA_*; only a public https endpoint is accepted (the edge runtime cannot reach Railway's private network). */
export function ollamaFromEnv(get: (k: string) => string | undefined): SelfHostedModel | null {
  const base = get("GROWTH_OS_OLLAMA_BASE_URL");
  const model = get("GROWTH_OS_OLLAMA_MODEL");
  if (!base || !model) return null;
  let url: URL;
  try { url = new URL(base); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const root = base.replace(/\/$/, "").replace(/\/chat\/completions$/, "");
  const v1 = root.endsWith("/v1") ? root : `${root}/v1`;
  return { chatEndpoint: `${v1}/chat/completions`, apiKey: get("GROWTH_OS_OLLAMA_API_KEY") ?? "ollama", model, reasoningEffort: get("GROWTH_OS_OLLAMA_REASONING_EFFORT") ?? "none" };
}

/** Default advanced class: the newest Claude Sonnet first, the newest Claude Opus as fallback. */
export const DEFAULT_ADVANCED = ["anthropic/claude-sonnet-*", "anthropic/claude-opus-*"];

export interface UsageRecord {
  requestId: string;
  generationId: string | null;
  model: string;
  purpose: string;
  promptTokens: number | null;
  completionTokens: number | null;
  /** OpenRouter's reported cost (usage.cost). null when the provider didn't report it. */
  actualUsd: number | null;
  estimatedUsd: number;
  latencyMs: number;
  attempt: number;
  status: "ok" | "error" | "invalid_output" | "refused_budget" | "cache_hit";
  error?: string;
}

/**
 * Server-side ledger. reserve() must atomically refuse when the budget would be
 * exceeded. settle() replaces the reservation with the actual cost; an unknown
 * actual cost (null) keeps the full worst-case reservation as spent.
 */
export interface BudgetLedger {
  reserve(usd: number): Promise<boolean>;
  settle(reservedUsd: number, actualUsd: number | null): Promise<void>;
}

export interface CallOptions {
  purpose: string;
  complexity: TaskComplexity;
  system: string;
  user: string;
  maxTokens: number;
  maxUsdPerCall: number;
  denyDataCollection: boolean;
  json?: { validate: (v: unknown) => string[] };
  cacheTtlMs?: number;
  timeoutMs?: number;
  maxAttemptsPerModel?: number;
}

export type CallResult =
  | { ok: true; text: string; json?: unknown; model: string; usage: UsageRecord[] }
  | { ok: false; reason: "blocked" | "budget" | "failed"; detail: string; usage: UsageRecord[] };

export interface GatewayDeps {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  newId: () => string;
  onUsage: (u: UsageRecord) => Promise<void> | void;
  ledger: BudgetLedger;
}

/** Reads the gateway config from the existing secrets. Returns null when AI isn't configured. */
export function gatewayConfigFromEnv(get: (k: string) => string | undefined): GatewayConfig | null {
  const base = get("LOCAL_LLM_BASE_URL");
  const model = get("LOCAL_LLM_MODEL");
  const key = get("LOCAL_LLM_API_KEY");
  if (!base || !model || !key) return null;
  // Same normalisation as aiConnection.ts: …/v1, …/v1/chat/completions or a bare host all end at …/v1.
  const root = base.replace(/\/$/, "").replace(/\/chat\/completions$/, "");
  const v1 = root.endsWith("/v1") ? root : `${root}/v1`;
  let classes: GatewayConfig["classes"] = {};
  const raw = get("GROWTH_OS_MODEL_CLASSES");
  if (raw) {
    try { classes = JSON.parse(raw); } catch { classes = {}; }
  }
  // Without an explicit policy, the platform's configured model serves the
  // standard class, and hard (complex) tasks go to Claude.
  if (!classes.small && !classes.standard && !classes.advanced) classes = { standard: [model] };
  if (!classes.advanced?.length) classes = { ...classes, advanced: DEFAULT_ADVANCED };
  const complexProviders = (get("GROWTH_OS_COMPLEX_PROVIDERS") ?? "anthropic").split(",").map((p) => p.trim()).filter(Boolean);
  return { chatEndpoint: `${v1}/chat/completions`, modelsEndpoint: `${v1}/models`, apiKey: key, classes, complexProviders, complexFallback: ollamaFromEnv(get) };
}

let catalogCache: { at: number; models: Map<string, CatalogModel> } | null = null;

export async function loadCatalog(cfg: GatewayConfig, deps: Pick<GatewayDeps, "fetch" | "now">, maxAgeMs = 10 * 60_000): Promise<Map<string, CatalogModel>> {
  if (catalogCache && deps.now() - catalogCache.at < maxAgeMs) return catalogCache.models;
  const res = await deps.fetch(cfg.modelsEndpoint, { headers: { Authorization: `Bearer ${cfg.apiKey}` } });
  if (!res.ok) throw new Error(`model catalogue HTTP ${res.status}`);
  const body = await res.json();
  const models = new Map<string, CatalogModel>();
  for (const m of (body?.data ?? []) as Record<string, unknown>[]) {
    const p = (m.pricing ?? {}) as Record<string, string>;
    const prompt = Number(p.prompt);
    const completion = Number(p.completion);
    if (typeof m.id !== "string" || !Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) continue;
    const params = Array.isArray(m.supported_parameters) ? m.supported_parameters as string[] : [];
    models.set(m.id, {
      id: m.id, promptUsdPerToken: prompt, completionUsdPerToken: completion,
      contextLength: Number(m.context_length) || 0,
      supportsJson: params.includes("response_format") || params.includes("structured_outputs"),
      created: Number(m.created) || 0,
    });
  }
  catalogCache = { at: deps.now(), models };
  return models;
}

export function resetCatalogCache() { catalogCache = null; }

/** Rough token estimate (4 chars/token, rounded up) used only for the worst-case cost check. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4) + 8;
}

export function worstCaseUsd(m: CatalogModel, promptTokens: number, maxTokens: number): number {
  return promptTokens * m.promptUsdPerToken + maxTokens * m.completionUsdPerToken;
}

/** Resolves a policy entry to one catalogue model: exact id, or the newest match of a `prefix*` pattern. */
export function resolveEntry(entry: string, catalog: Map<string, CatalogModel>): CatalogModel | undefined {
  if (!entry.endsWith("*")) return catalog.get(entry);
  const prefix = entry.slice(0, -1);
  let best: CatalogModel | undefined;
  for (const m of catalog.values()) {
    // ":free"/":beta" variants are other routing tiers of the same model, not newer models.
    if (!m.id.startsWith(prefix) || m.id.includes(":")) continue;
    if (!best || m.created > best.created || (m.created === best.created && m.id > best.id)) best = m;
  }
  return best;
}

/**
 * Eligible models: class ≥ minimum, present in the live catalogue, within the
 * per-call cost cap. Ordinary tasks: cheapest first. Complex tasks: only the
 * allowed providers (Claude by default), in the owner's preference order.
 */
export function eligibleModels(cfg: GatewayConfig, catalog: Map<string, CatalogModel>, complexity: TaskComplexity, promptTokens: number, maxTokens: number, maxUsdPerCall: number, needJson: boolean) {
  const min = RANK[MIN_CLASS[complexity]];
  const out: { model: CatalogModel; cls: ModelClass; worst: number }[] = [];
  for (const cls of ["small", "standard", "advanced"] as ModelClass[]) {
    if (RANK[cls] < min) continue;
    for (const entry of cfg.classes[cls] ?? []) {
      const m = resolveEntry(entry, catalog);
      if (!m) continue;
      if (complexity === "complex" && !cfg.complexProviders.some((p) => m.id.startsWith(`${p}/`))) continue;
      if (needJson && !m.supportsJson) continue;
      if (m.contextLength && promptTokens + maxTokens > m.contextLength) continue;
      const worst = worstCaseUsd(m, promptTokens, maxTokens);
      if (worst > maxUsdPerCall) continue;
      if (!out.some((o) => o.model.id === m.id)) out.push({ model: m, cls, worst });
    }
  }
  if (complexity === "complex") return out; // policy order: quality first, not price
  return out.sort((a, b) => a.worst - b.worst || RANK[a.cls] - RANK[b.cls]);
}

interface Candidate { id: string; worst: number; endpoint: string; apiKey: string; selfHosted: SelfHostedModel | null }

const responseCache = new Map<string, { at: number; text: string }>();

function retryable(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export async function callModel(cfg: GatewayConfig, opts: CallOptions, deps: GatewayDeps): Promise<CallResult> {
  const usage: UsageRecord[] = [];
  const record = async (u: UsageRecord) => { usage.push(u); await deps.onUsage(u); };

  const fallback = opts.complexity === "complex" ? cfg.complexFallback : null;
  let catalog: Map<string, CatalogModel>;
  try {
    catalog = await loadCatalog(cfg, deps);
  } catch (e) {
    // OpenRouter itself unreachable: a complex task may still use the Ollama fallback.
    if (!fallback) return { ok: false, reason: "failed", detail: `catalogue unavailable: ${(e as Error).message}`, usage };
    catalog = new Map();
  }
  const promptTokens = estimateTokens(opts.system) + estimateTokens(opts.user);
  const candidates: Candidate[] = eligibleModels(cfg, catalog, opts.complexity, promptTokens, opts.maxTokens, opts.maxUsdPerCall, !!opts.json)
    .map((c) => ({ id: c.model.id, worst: c.worst, endpoint: cfg.chatEndpoint, apiKey: cfg.apiKey, selfHosted: null }));
  // Claude first; Ollama on Railway only when no Claude model is there or all of them failed.
  if (fallback) candidates.push({ id: `ollama/${fallback.model}`, worst: 0, endpoint: fallback.chatEndpoint, apiKey: fallback.apiKey, selfHosted: fallback });
  if (candidates.length === 0) {
    const who = opts.complexity === "complex" ? ` from ${cfg.complexProviders.join("/")} (and no Ollama fallback configured: GROWTH_OS_OLLAMA_*)` : "";
    return { ok: false, reason: "blocked", detail: `no policy model of class ≥ ${MIN_CLASS[opts.complexity]}${who} in the live catalogue within ${opts.maxUsdPerCall} USD/call`, usage };
  }

  const cacheKey = opts.cacheTtlMs ? canonicalJson([opts.complexity, opts.system, opts.user, opts.maxTokens, candidates.map((c) => c.id)]) : null;
  if (cacheKey) {
    const hit = responseCache.get(cacheKey);
    if (hit && deps.now() - hit.at < opts.cacheTtlMs!) {
      await record({ requestId: deps.newId(), generationId: null, model: "cache", purpose: opts.purpose, promptTokens: 0, completionTokens: 0, actualUsd: 0, estimatedUsd: 0, latencyMs: 0, attempt: 0, status: "cache_hit" });
      const json = opts.json ? JSON.parse(hit.text) : undefined;
      return { ok: true, text: hit.text, json, model: "cache", usage };
    }
  }

  const maxAttempts = opts.maxAttemptsPerModel ?? 3;
  let lastError = "";
  for (const cand of candidates) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (!(await deps.ledger.reserve(cand.worst))) {
        await record({ requestId: deps.newId(), generationId: null, model: cand.id, purpose: opts.purpose, promptTokens: null, completionTokens: null, actualUsd: null, estimatedUsd: cand.worst, latencyMs: 0, attempt, status: "refused_budget" });
        return { ok: false, reason: "budget", detail: `budget would be exceeded (worst case ${cand.worst.toFixed(6)} USD)`, usage };
      }
      const requestId = deps.newId();
      const started = deps.now();
      const controller = new AbortController();
      // CPU-only Ollama is slow (~23 s measured for a realistic prompt): give it more time, capped below the edge wall clock.
      const timeoutMs = cand.selfHosted ? Math.min(90_000, (opts.timeoutMs ?? 30_000) * 3) : opts.timeoutMs ?? 30_000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let actual: number | null = null;
      try {
        const res = await deps.fetch(cand.endpoint, {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cand.apiKey}`, "X-Request-Id": requestId, "X-Title": "AI Agency Danmark Growth OS" },
          body: JSON.stringify({
            model: cand.selfHosted ? cand.selfHosted.model : cand.id,
            temperature: 0.1,
            max_tokens: opts.maxTokens,
            stream: false,
            // OpenRouter-only fields; the self-hosted instance keeps prompts on our own server anyway.
            ...(cand.selfHosted ? (cand.selfHosted.reasoningEffort ? { reasoning_effort: cand.selfHosted.reasoningEffort } : {}) : { usage: { include: true } }),
            ...(!cand.selfHosted && opts.denyDataCollection ? { provider: { data_collection: "deny" } } : {}),
            ...(opts.json ? { response_format: { type: "json_object" } } : {}),
            messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
          }),
        });
        const latencyMs = deps.now() - started;
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try { const b = await res.json(); if (b?.error?.message) msg += `: ${String(b.error.message).slice(0, 200)}`; } catch { /* not json */ }
          lastError = msg;
          await deps.ledger.settle(cand.worst, 0);
          await record({ requestId, generationId: null, model: cand.id, purpose: opts.purpose, promptTokens: null, completionTokens: null, actualUsd: 0, estimatedUsd: cand.worst, latencyMs, attempt, status: "error", error: msg });
          if (retryable(res.status) && attempt < maxAttempts) { await deps.sleep(backoffMs(attempt)); continue; }
          break; // non-retryable (or out of attempts): next model in the chain
        }
        const body = await res.json();
        const u = body?.usage ?? {};
        actual = cand.selfHosted ? 0 : typeof u.cost === "number" ? u.cost : null;
        await deps.ledger.settle(cand.worst, actual);
        const text = body?.choices?.[0]?.message?.content;
        const base = { requestId, generationId: typeof body?.id === "string" ? body.id : null, model: cand.selfHosted ? cand.id : typeof body?.model === "string" ? body.model : cand.id, purpose: opts.purpose, promptTokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : null, completionTokens: typeof u.completion_tokens === "number" ? u.completion_tokens : null, actualUsd: actual, estimatedUsd: cand.worst, latencyMs, attempt };
        if (typeof text !== "string" || !text.trim()) {
          lastError = "empty response";
          await record({ ...base, status: "error", error: lastError });
          continue;
        }
        let json: unknown = undefined;
        if (opts.json) {
          try {
            const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
            json = JSON.parse(clean);
          } catch {
            lastError = "output is not JSON";
            await record({ ...base, status: "invalid_output", error: lastError });
            continue;
          }
          const errs = opts.json.validate(json);
          if (errs.length) {
            lastError = `output failed validation: ${errs.slice(0, 3).join("; ")}`;
            await record({ ...base, status: "invalid_output", error: lastError });
            continue;
          }
        }
        await record({ ...base, status: "ok" });
        if (cacheKey) responseCache.set(cacheKey, { at: deps.now(), text: opts.json ? JSON.stringify(json) : text });
        return { ok: true, text, json, model: base.model, usage };
      } catch (e) {
        const latencyMs = deps.now() - started;
        lastError = (e as Error).name === "AbortError" ? "timeout" : (e as Error).message;
        await deps.ledger.settle(cand.worst, actual ?? 0);
        await record({ requestId, generationId: null, model: cand.id, purpose: opts.purpose, promptTokens: null, completionTokens: null, actualUsd: null, estimatedUsd: cand.worst, latencyMs, attempt, status: "error", error: lastError });
        if (attempt < maxAttempts) await deps.sleep(backoffMs(attempt));
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return { ok: false, reason: "failed", detail: lastError || "all models failed", usage };
}

export function backoffMs(attempt: number): number {
  return Math.min(8_000, 500 * 2 ** (attempt - 1));
}
