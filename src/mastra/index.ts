import { Mastra } from "@mastra/core";
import { createDiagnosticAgent } from "./agents/diagnostic-agent.ts";
import { mockModel, liveModelConfig } from "./model.ts";

/**
 * Minimal Mastra registry for AI Agency Danmark.
 *
 * This is the FOUNDATION only: it registers a single isolated diagnostic agent
 * (see ./agents/diagnostic-agent.ts). Department agents (CRM, Sales, Finance,
 * HR, …) are mapped in docs/ai/MASTRA_AGENT_MAP.md and are intentionally NOT
 * implemented here.
 *
 * The registry constructs with a deterministic mock model so that importing it
 * never requires credentials or network access. To go live, swap `mockModel()`
 * for a provider built from `liveModelConfig()` (needs an OpenAI-compatible
 * provider package — a documented remaining dependency). This file is server-
 * side only and must never be imported into the Vite client bundle.
 */
const diagnostic = createDiagnosticAgent(mockModel());

export const mastra = new Mastra({
  agents: { diagnostic },
});

export { createDiagnosticAgent, mockModel, liveModelConfig };
