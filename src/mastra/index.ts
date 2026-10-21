import { Mastra } from "@mastra/core";
import { createDiagnosticAgent } from "./agents/diagnostic-agent.ts";
import { mockModel, liveModel, liveModelConfig } from "./model.ts";
import { resolveModel, resolveModelForTask } from "./model-router.ts";

/**
 * Minimal Mastra registry for AI Agency Danmark.
 *
 * This is the FOUNDATION only: it registers a single isolated diagnostic agent
 * (see ./agents/diagnostic-agent.ts). Department agents (CRM, Sales, Finance,
 * HR, …) are mapped in docs/ai/MASTRA_AGENT_MAP.md and are intentionally NOT
 * implemented here.
 *
 * The diagnostic agent resolves its model through the shared {@link resolveModel}
 * router at `diagnostic` complexity. With no env configured this yields a
 * deterministic mock (so importing the registry never needs credentials or
 * network), and with `MASTRA_ENABLE_LOCAL_SMALL=1` + `LOCAL_LLM_*` it uses the
 * flagged local small model. The local 2B is therefore NEVER a silent global
 * default. Department agents should likewise resolve via {@link resolveModelForTask}
 * and honor a `blocked` result rather than downgrading. This file is server-side
 * only and must never be imported into the Vite client bundle.
 */
const diagResolution = resolveModel("diagnostic");
const diagnostic = createDiagnosticAgent(
  diagResolution.status === "ok" ? diagResolution.model : mockModel(),
);

export const mastra = new Mastra({
  agents: { diagnostic },
});

export {
  createDiagnosticAgent,
  mockModel,
  liveModel,
  liveModelConfig,
  resolveModel,
  resolveModelForTask,
};
