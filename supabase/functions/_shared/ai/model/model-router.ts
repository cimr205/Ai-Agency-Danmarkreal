import { aiConfig } from "../config/ai.config.ts";
import { GroqProvider } from "../providers/groq.provider.ts";
import { OllamaProvider } from "./ollama.client.ts";
import type { AIModelProvider } from "../providers/model-provider.types.ts";

// The ONLY place that decides which model backend is active. Every other
// module imports AIModel from here — never GroqProvider/OllamaProvider
// directly — so switching providers is a one-line env change, not a
// code change (§4/§28). AI_PROVIDER=groq is the production default;
// =ollama is kept as an explicit opt-in self-hosted fallback, never the
// silent default.
export const AIModel: AIModelProvider = aiConfig.provider === "ollama" ? OllamaProvider : GroqProvider;
