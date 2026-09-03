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

export interface ModelHealth {
  configured: boolean;
  online: boolean;
  provider: string | null;
  name: string | null;
  checkedAt: string;
  error?: string;
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
  timeoutMs = 55_000,
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
        max_tokens: 192,
        stream: false,
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
    const clean = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    return JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean);
  } finally {
    clearTimeout(timer);
  }
}

export async function generateText(
  model: RoutedModel,
  system: string,
  user: string,
  timeoutMs = 22_000,
  maxTokens = 96,
): Promise<string> {
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
        max_tokens: maxTokens,
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}`);
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("Local model returned no text");
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

export async function checkModelHealth(
  model: RoutedModel | null,
  timeoutMs = 3_000,
): Promise<ModelHealth> {
  const checkedAt = new Date().toISOString();
  if (!model) {
    return { configured: false, online: false, provider: null, name: null, checkedAt };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const modelsEndpoint = model.endpoint.replace(/\/chat\/completions$/, "/models");
    const response = await fetch(modelsEndpoint, {
      method: "GET",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${model.apiKey}` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json().catch(() => ({}));
    const advertised = Array.isArray(body?.data)
      ? body.data.some((item: unknown) => typeof item === "object" && item !== null && (item as { id?: unknown }).id === model.model)
      : true;
    if (!advertised) throw new Error("Den valgte model findes ikke på serveren");
    return { configured: true, online: true, provider: model.provider, name: model.model, checkedAt };
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "Modelserveren svarede ikke inden timeout"
      : error instanceof Error ? error.message : "Modelserveren kunne ikke nås";
    return { configured: true, online: false, provider: model.provider, name: model.model, checkedAt, error: message };
  } finally {
    clearTimeout(timer);
  }
}
