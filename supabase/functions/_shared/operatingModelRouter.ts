/* eslint-disable @typescript-eslint/no-explicit-any */
// Small OpenAI-compatible model abstraction for the Operating Manager.
// A local llama.cpp/Ollama/vLLM endpoint can be configured globally with
// LOCAL_LLM_BASE_URL + LOCAL_LLM_MODEL, or per company in ai_connections
// with provider="local". Core signals and action execution never need a model.

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

  const { data } = await db
    .from("ai_connections")
    .select("provider,api_key,model")
    .eq("company_id", companyId)
    .eq("provider", "local")
    .eq("status", "connected")
    .maybeSingle();

  const endpoint = Deno.env.get("LOCAL_LLM_BASE_URL");
  if (!data || !endpoint) return null;
  return {
    provider: "local",
    model: data.model,
    endpoint: normalizeEndpoint(endpoint),
    apiKey: data.api_key || "local",
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
    if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}`);
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Local model returned no JSON content");
    return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
  } finally {
    clearTimeout(timer);
  }
}
