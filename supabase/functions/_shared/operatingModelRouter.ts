/* eslint-disable @typescript-eslint/no-explicit-any */
// Small OpenAI-compatible model abstraction for the Operating Manager.
//
// Correction (found live, not assumed): this previously only checked for a
// self-hosted llama.cpp/Ollama/vLLM endpoint (LOCAL_LLM_BASE_URL env var, or
// a per-company row in an `ai_connections` table). Neither exists anywhere
// in this deployment — no LOCAL_LLM_BASE_URL is set, and `ai_connections`
// was a table from an earlier, since-abandoned attempt at this exact
// problem (superseded by `openai_accounts`, see migration
// 20260831000003_drop_redundant_ai_connections.sql — the table no longer
// exists). resolveModel() therefore always returned null, so the entire
// "plan" tier (real reasoning/planning) silently never ran — only the
// deterministic regex fast-paths in ai-operating-manager's command()
// worked. This is why "prepare my day" or anything needing real
// interpretation just said "connect a local model."
//
// Fixed to fall back to the same per-company connection every other AI
// feature in the app already uses (openai_accounts — company's own OpenAI
// key, or Groq, which is a genuinely free tier and the practical
// equivalent of "local" in a stateless serverless deployment where an
// actual persistent Ollama/llama.cpp process can't run). A true
// self-hosted endpoint is still supported first if LOCAL_LLM_BASE_URL is
// ever set — this is additive, not a removal of that path.
import { getCompanyAI, describeOpenAIError, type CompanyAI } from "./aiConnection.ts";

// deno-lint-ignore no-explicit-any
type DbClient = any;

export type ModelPurpose = "route" | "extract" | "plan" | "summarize";

export interface RoutedModel {
  provider: string;
  model: string;
  endpoint: string;
  apiKey: string;
  tier: "fast" | "reasoning";
}

const PURPOSE_TIER: Record<ModelPurpose, RoutedModel["tier"]> = {
  route: "fast",
  extract: "fast",
  summarize: "fast",
  plan: "reasoning",
};

function normalizeEndpoint(url: string) {
  const clean = url.replace(/\/$/, "");
  return clean.endsWith("/chat/completions") ? clean : `${clean}/chat/completions`;
}

export async function resolveModel(
  db: DbClient,
  companyId: string,
  purpose: ModelPurpose,
): Promise<RoutedModel | null> {
  const tier = PURPOSE_TIER[purpose];
  const localUrl = Deno.env.get("LOCAL_LLM_BASE_URL");
  const localModel = tier === "reasoning"
    ? Deno.env.get("LOCAL_LLM_REASONING_MODEL") ?? Deno.env.get("LOCAL_LLM_MODEL")
    : Deno.env.get("LOCAL_LLM_FAST_MODEL") ?? Deno.env.get("LOCAL_LLM_MODEL");

  if (localUrl && localModel) {
    return {
      provider: "local",
      model: localModel,
      endpoint: normalizeEndpoint(localUrl),
      apiKey: Deno.env.get("LOCAL_LLM_API_KEY") ?? "local",
      tier,
    };
  }

  const companyAI: CompanyAI | null = await getCompanyAI(db, companyId);
  if (!companyAI) return null;
  return {
    provider: companyAI.provider,
    model: companyAI.model,
    endpoint: companyAI.url,
    apiKey: companyAI.apiKey,
    tier,
  };
}

export async function generateStructured(
  model: RoutedModel,
  system: string,
  user: string,
  timeoutMs = 12_000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(model.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify({
        model: model.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) {
      const provider = model.provider === "groq" ? "groq" : "openai";
      const { message } = await describeOpenAIError(response, provider);
      throw new Error(model.provider === "local" ? `Local model returned HTTP ${response.status}` : message);
    }
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Local model returned no JSON content");
    return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
  } finally {
    clearTimeout(timer);
  }
}
