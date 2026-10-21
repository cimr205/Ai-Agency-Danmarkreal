/// <reference types="node" />
/**
 * Mastra installation verification.
 *
 * Runs the diagnostic agent against a deterministic MOCK model (no network, no
 * keys) and reports machine-readable results. Live inference against the app's
 * configured endpoint is reported as NOT TESTED unless LOCAL_LLM_BASE_URL is
 * set (and even then this script does not call it — live wiring needs an
 * OpenAI-compatible provider, a documented remaining dependency).
 *
 * Run:  node src/mastra/verify.ts   (Node >= 22.18 strips TS types natively)
 */
import { mastra } from "./index.ts";
import { createDiagnosticAgent } from "./agents/diagnostic-agent.ts";
import { mockModel, liveModelConfig } from "./model.ts";

async function main() {
  const result: Record<string, unknown> = {};

  // 1. Mastra registry loads and exposes the diagnostic agent.
  const registered = mastra.getAgent("diagnostic");
  result.mastraLoaded = Boolean(mastra);
  result.diagnosticRegistered = Boolean(registered);

  // 2. Deterministic mock invocation.
  const agent = createDiagnosticAgent(mockModel("pong"));
  const res = await agent.generate("ping");
  const text = typeof (res as { text?: unknown }).text === "string"
    ? (res as { text: string }).text
    : String((res as { text?: unknown }).text ?? "");
  result.agentName = agent.name;
  result.mockReply = text;
  result.mockInvocation = text.includes("pong") ? "PASS" : "FAIL";

  // 3. Live inference status (never faked).
  const live = liveModelConfig();
  result.liveInference = live
    ? "CONFIGURED (LOCAL_LLM_BASE_URL present) but NOT TESTED by this script"
    : "NOT TESTED (no LOCAL_LLM_BASE_URL configured)";

  console.log(JSON.stringify(result, null, 2));
  if (result.mockInvocation !== "PASS" || !result.diagnosticRegistered) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("VERIFY_ERROR:", err);
  process.exit(1);
});
