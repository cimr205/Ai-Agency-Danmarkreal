// Central config for the AI Action Engine. Every value is env-driven so
// the model/provider can change without touching code. Groq is the
// default production provider (fast, hosted, generous free tier);
// self-hosted Ollama remains available as an explicit opt-in fallback
// (AI_PROVIDER=ollama) — never OpenAI/Anthropic/Gemini/OpenRouter.
export const aiConfig = {
  provider: Deno.env.get("AI_PROVIDER") ?? "groq",
  contextLength: Number(Deno.env.get("AI_CONTEXT_LENGTH") ?? "4096"),
  maxRetries: Number(Deno.env.get("AI_MAX_RETRIES") ?? "1"),
  maxMemoryMessages: 6,

  groq: {
    apiKey: Deno.env.get("GROQ_API_KEY") ?? "",
    baseUrl: (Deno.env.get("GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1").replace(/\/$/, ""),
    model: Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-20b",
    timeoutMs: Number(Deno.env.get("GROQ_TIMEOUT_MS") ?? "20000"),
  },

  ollama: {
    model: Deno.env.get("AI_MODEL") ?? Deno.env.get("LOCAL_LLM_MODEL") ?? "qwen3:1.7b",
    baseUrl: (Deno.env.get("OLLAMA_BASE_URL") ?? Deno.env.get("LOCAL_LLM_BASE_URL") ?? "").replace(/\/$/, ""),
    apiKey: Deno.env.get("LOCAL_LLM_API_KEY") ?? "ollama",
    timeoutMs: Number(Deno.env.get("AI_REQUEST_TIMEOUT_MS") ?? "30000"),
  },
} as const;
