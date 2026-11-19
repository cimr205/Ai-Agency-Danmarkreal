// Free-only model calls for the SEO autopilot (owner decision 2026-11-17: "kun gratis").
//
// A model is used only when the LIVE OpenRouter catalogue prices both prompt and
// completion at exactly 0. A response that still reports a cost > 0 stops the run
// (FreeModelCostError) instead of spending more. All models answering 429 is a
// normal state for free tiers: it throws RateLimitedError so the caller can retry
// the task on a later run without counting it as a failed attempt.
import { type CatalogModel, type GatewayConfig, loadCatalog } from "../openrouter.ts";

export const DEFAULT_FREE_MODELS = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

export class RateLimitedError extends Error {}
export class FreeModelCostError extends Error {}
export class NoFreeModelError extends Error {}

export interface FreeCall { system: string; user: string; maxTokens: number }
export interface FreeResult { text: string; model: string; promptTokens: number; completionTokens: number; costUsd: number }
export interface FreeLlmDeps { fetch: typeof fetch; now: () => number; timeoutMs?: number }

export const isFree = (m: CatalogModel) => m.promptUsdPerToken === 0 && m.completionUsdPerToken === 0;

/**
 * Up to 3 free models: the configured ones that exist and are free, in order,
 * then the newest other free models with enough context. Never a paid model.
 */
export function pickFreeModels(catalog: Map<string, CatalogModel>, preferred: string[], max = 3): string[] {
  const out = preferred.filter((id) => { const m = catalog.get(id); return m && isFree(m); });
  const rest = [...catalog.values()].filter((m) => isFree(m) && m.contextLength >= 32_000 && !out.includes(m.id))
    .sort((a, b) => b.created - a.created).map((m) => m.id);
  return [...out, ...rest].slice(0, max);
}

export function freeModelsFromEnv(get: (k: string) => string | undefined): string[] {
  const raw = get("GROWTH_OS_SEO_FREE_MODELS");
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_FREE_MODELS;
}

export async function callFree(cfg: GatewayConfig, preferred: string[], call: FreeCall, deps: FreeLlmDeps): Promise<FreeResult> {
  const catalog = await loadCatalog(cfg, deps);
  const models = pickFreeModels(catalog, preferred);
  if (!models.length) throw new NoFreeModelError("no free model in the OpenRouter catalogue");
  const errors: string[] = [];
  let limited = 0;
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 180_000);
    try {
      const res = await deps.fetch(cfg.chatEndpoint, {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json", "X-Title": "Growth OS SEO autopilot" },
        body: JSON.stringify({
          model, max_tokens: call.maxTokens, temperature: 0.4,
          messages: [{ role: "system", content: call.system }, { role: "user", content: call.user }],
          reasoning: { effort: "low", exclude: true }, usage: { include: true },
        }),
      });
      if (res.status === 429) { limited++; errors.push(`${model}: 429`); await res.body?.cancel(); continue; }
      if (!res.ok) { errors.push(`${model}: HTTP ${res.status}`); await res.body?.cancel(); continue; }
      const data = await res.json() as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }; error?: { message?: string; code?: number } };
      if (data.error) {
        if (data.error.code === 429) { limited++; errors.push(`${model}: 429`); continue; }
        errors.push(`${model}: ${data.error.message ?? "error"}`); continue;
      }
      const cost = Number(data.usage?.cost ?? 0);
      if (cost > 0) throw new FreeModelCostError(`${model} reported a cost of ${cost} USD; stopping (free models only)`);
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) { errors.push(`${model}: empty answer`); continue; }
      return { text, model, promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0, costUsd: 0 };
    } catch (e) {
      if (e instanceof FreeModelCostError) throw e;
      errors.push(`${model}: ${(e as Error).name === "AbortError" ? "timeout" : (e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  if (limited === models.length) throw new RateLimitedError(`all free models are rate limited (${errors.join("; ")})`);
  throw new Error(`no free model answered (${errors.join("; ")})`);
}
