// Central config for the AI Action Engine. Every value is env-driven so
// the model/provider can change without touching code — self-hosted
// Ollama only, per the approved stack (no OpenAI/Anthropic/Gemini/paid
// per-token APIs).
export const aiConfig = {
  provider: Deno.env.get("AI_PROVIDER") ?? "ollama",
  model: Deno.env.get("AI_MODEL") ?? "qwen3:1.7b",
  ollamaBaseUrl: (Deno.env.get("OLLAMA_BASE_URL") ?? Deno.env.get("LOCAL_LLM_BASE_URL") ?? "").replace(/\/$/, ""),
  ollamaApiKey: Deno.env.get("LOCAL_LLM_API_KEY") ?? "ollama",
  contextLength: Number(Deno.env.get("AI_CONTEXT_LENGTH") ?? "4096"),
  requestTimeoutMs: Number(Deno.env.get("AI_REQUEST_TIMEOUT_MS") ?? "30000"),
  maxRetries: Number(Deno.env.get("AI_MAX_RETRIES") ?? "1"),
  maxMemoryMessages: 6,
} as const;

export function chatCompletionsUrl(): string {
  const base = aiConfig.ollamaBaseUrl;
  if (!base) throw new Error("OLLAMA_BASE_URL/LOCAL_LLM_BASE_URL is not configured");
  return base.endsWith("/chat/completions") ? base : `${base}/v1/chat/completions`;
}
