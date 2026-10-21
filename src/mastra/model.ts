/// <reference types="node" />
import { MockLanguageModelV3 } from "ai/test";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * Provider-agnostic model wiring for Mastra.
 *
 * The app already routes every AI feature through a single OpenAI-compatible
 * endpoint configured by environment variables (see
 * `supabase/functions/_shared/operatingModelRouter.ts`). Mastra reuses the
 * same env contract so there is never a hardcoded key or provider.
 */
export interface LiveModelConfig {
  baseURL: string;
  model: string;
  apiKey: string;
}

/**
 * Deterministic mock language model for installation / verification tests.
 * No network, no credentials — always returns `reply`. Used so the diagnostic
 * agent can be invoked in CI and marks live inference as NOT TESTED.
 */
export function mockModel(reply = "pong"): LanguageModel {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text" as const, text: reply }],
      finishReason: { unified: "stop" as const, raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  }) as unknown as LanguageModel;
}

/**
 * Reads the app's existing OpenAI-compatible endpoint config from env.
 * Returns null when not configured, so callers fall back to {@link mockModel}
 * and report live inference as NOT TESTED. Building an actual live model needs
 * an OpenAI-compatible provider (`@ai-sdk/openai-compatible`) — intentionally
 * NOT added yet (documented in MASTRA_INSTALL_VERIFICATION.md).
 */
export function liveModelConfig(): LiveModelConfig | null {
  const baseURL = process.env.LOCAL_LLM_BASE_URL;
  const model = process.env.LOCAL_LLM_MODEL;
  if (!baseURL || !model) return null;
  return { baseURL, model, apiKey: process.env.LOCAL_LLM_API_KEY ?? "" };
}

/**
 * Builds a LIVE language model from an OpenAI-compatible endpoint (e.g. a local
 * Ollama server at http://localhost:11434/v1). Returns null when no config is
 * present, so callers fall back to {@link mockModel}. This is the only place a
 * real provider is constructed; it still holds no hardcoded key or URL — all of
 * it comes from env via {@link liveModelConfig}.
 */
export interface LiveModelOptions {
  /**
   * Value sent as the request's `reasoning_effort`. Pass "none" to disable a
   * thinking model's reasoning channel (required for Qwen3.x on Ollama).
   * Pass "" (empty) to leave the request body untouched (for models that
   * reject the field). When undefined, falls back to LOCAL_LLM_REASONING_EFFORT
   * and finally to "none".
   */
  reasoningEffort?: string | null;
}

export function liveModel(cfg?: LiveModelConfig | null, opts: LiveModelOptions = {}): LanguageModel | null {
  const c = cfg === undefined ? liveModelConfig() : cfg;
  if (!c) return null;

  // Thinking ("reasoning") models such as Qwen3.x on Ollama otherwise emit an
  // EMPTY `content` with every token routed to a separate reasoning channel,
  // so the agent sees no text. Ollama's OpenAI-compatible endpoint honours
  // `reasoning_effort: "none"` to disable this. Configurable per model (router
  // passes a per-slot value) and via env; default "none" because it is
  // required for correct text output on these models and because thinking is
  // prohibitively slow on CPU-only hardware. A falsy value leaves the request
  // body untouched.
  const reasoningEffort = opts.reasoningEffort !== undefined
    ? opts.reasoningEffort
    : (process.env.LOCAL_LLM_REASONING_EFFORT ?? "none");
  const patchedFetch: typeof fetch = async (input, init) => {
    if (reasoningEffort && init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        if (body && typeof body === "object" && body.reasoning_effort === undefined) {
          body.reasoning_effort = reasoningEffort;
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch {
        /* non-JSON body: leave unchanged */
      }
    }
    return fetch(input as Parameters<typeof fetch>[0], init);
  };

  const provider = createOpenAICompatible({
    name: "local-openai-compatible",
    baseURL: c.baseURL,
    // Ollama ignores the key but the SDK requires a non-empty string.
    apiKey: c.apiKey || "ollama",
    fetch: patchedFetch,
  });
  return provider(c.model) as unknown as LanguageModel;
}
