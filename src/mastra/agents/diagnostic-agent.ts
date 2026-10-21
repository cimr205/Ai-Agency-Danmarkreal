import { Agent } from "@mastra/core/agent";
import type { LanguageModel } from "ai";

/**
 * Minimal, isolated diagnostic agent. Its only job is to prove the Mastra
 * runtime is wired correctly inside AI Agency Danmark. It has no tools, no
 * data access, and no side effects — it must not be mistaken for a department
 * agent. Department agents are specified in docs/ai/MASTRA_AGENT_MAP.md and
 * are NOT implemented yet.
 *
 * The model is injected so the same agent can run against a deterministic mock
 * (tests) or the app's configured OpenAI-compatible endpoint (live).
 */
export function createDiagnosticAgent(model: LanguageModel) {
  return new Agent({
    id: "diagnostic",
    name: "diagnostic",
    instructions:
      "You are the Mastra installation diagnostic agent for AI Agency Danmark. " +
      "Answer concisely. You exist only to confirm that the Mastra runtime, agent " +
      "registry and model wiring are functioning. Do not take actions or claim " +
      "access to business data.",
    model,
  });
}
