/// <reference types="node" />
import { MockLanguageModelV3 } from "ai/test";
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
