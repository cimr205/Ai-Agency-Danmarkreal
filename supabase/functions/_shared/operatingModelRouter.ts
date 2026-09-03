/* eslint-disable @typescript-eslint/no-explicit-any */
// Small OpenAI-compatible model abstraction for the Operating Manager.
// Resolves to the single shared self-hosted Ollama instance
// (LOCAL_LLM_BASE_URL / LOCAL_LLM_MODEL, see _shared/aiConnection.ts) —
// the only model provider approved for this system. No OpenAI, no Groq,
// no other hosted LLM API.
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

export async function resolveModel(
  db: DbClient,
  companyId: string,
  purpose: ModelPurpose,
): Promise<RoutedModel | null> {
  const tier = PURPOSE_TIER[purpose];
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
  // CPU-only self-hosted Ollama measured at ~23s for a realistic prompt
  // (llama3.2:3b on the Railway instance) — 12s aborted real requests.
  timeoutMs = 45_000,
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
      const { message } = await describeOpenAIError(response);
      throw new Error(message);
    }
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Modellen returnerede intet JSON-indhold");
    return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
  } finally {
    clearTimeout(timer);
  }
}
