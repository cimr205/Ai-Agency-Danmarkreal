// deno-lint-ignore-file no-explicit-any
import { RequestRouter } from "./router/request-router.ts";
import { buildDomainContext } from "./context/context-builder.ts";
import { searchCapabilities } from "./capabilities/capability-search.ts";
import { registerCoreCapabilities } from "./capabilities/core-capabilities.ts";
import { generatePlan } from "./planning/planner.ts";
import { validatePlan } from "./planning/plan-validator.ts";
import { executePlan, type StepExecutionRecord } from "./execution/execution-engine.ts";
import { generateResponse } from "./response/response-generator.ts";
import { loadRecentMessages, appendMessage, getOrCreateConversation } from "./memory/conversation-memory.ts";
import type { ExecutionContext } from "./execution/execution.types.ts";

registerCoreCapabilities();

export interface AIRequest {
  workspaceId: string; // resolved server-side, never trusted from client body
  userId: string;
  message: string;
  conversationId?: string;
  locale?: "da" | "en" | "de";
  confirm?: boolean;
}

export type AIResponse =
  | { status: "answer"; language: string; message: string; conversationId: string }
  | { status: "completed"; language: string; message: string; executionId: string; conversationId: string }
  | { status: "partial"; language: string; message: string; executionId: string; conversationId: string }
  | { status: "failed"; language: string; message: string; executionId: string; conversationId: string }
  | { status: "requires_connection"; message: string; requiredCapability: string; providers: string[]; conversationId: string }
  | { status: "requires_confirmation"; confirmationId: string; message: string; conversationId: string }
  | { status: "requires_clarification"; message: string; conversationId: string }
  | { status: "rejected"; message: string; conversationId: string };

export async function handleAIMessage(
  db: any,
  roles: import("./execution/execution.types.ts").Role[],
  authHeader: string,
  req: AIRequest,
  onStatus?: (status: string) => void,
): Promise<AIResponse> {
  const conversationId = await getOrCreateConversation(db, req.workspaceId, req.userId, req.conversationId);
  await appendMessage(db, conversationId, req.workspaceId, req.userId, "user", req.message);

  onStatus?.("thinking");
  const route = await RequestRouter.route(req.message);

  if (route.domain === "unknown" || route.actionType === "answer") {
    const memory = await loadRecentMessages(db, conversationId, req.workspaceId);
    const { OllamaClient } = await import("./model/ollama.client.ts");
    const { SYSTEM_IDENTITY } = await import("./prompts/system.ts");
    let reply: string;
    try {
      reply = await OllamaClient.chat([{ role: "system", content: SYSTEM_IDENTITY }, ...memory, { role: "user", content: req.message }]);
    } catch {
      reply = route.language === "da" ? "AI-modellen svarer ikke lige nu." : route.language === "de" ? "Das KI-Modell antwortet derzeit nicht." : "The AI model is not responding right now.";
    }
    await appendMessage(db, conversationId, req.workspaceId, req.userId, "assistant", reply);
    return { status: "answer", language: route.language, message: reply, conversationId };
  }

  onStatus?.("planning");
  const context: ExecutionContext = { db, workspaceId: req.workspaceId, userId: req.userId, roles, authHeader };
  const domainContext = await buildDomainContext(route.domain, context);
  const candidates = searchCapabilities(req.message, route.domain, roles);
  const memory = await loadRecentMessages(db, conversationId, req.workspaceId);

  const planned = await generatePlan(`${req.message}\n\n[context: ${JSON.stringify(domainContext)}]`, route.language, candidates, memory);
  if (!planned.ok || !planned.plan) {
    const message = route.language === "da" ? "Jeg kunne ikke lave en gyldig plan for det." : route.language === "de" ? "Dafür konnte ich keinen gültigen Plan erstellen." : "I couldn't produce a valid plan for that.";
    return { status: "failed", language: route.language, message, executionId: "", conversationId };
  }
  const plan = planned.plan;

  if (plan.requiresClarification) {
    const message = plan.clarificationQuestion ?? "Can you clarify?";
    await appendMessage(db, conversationId, req.workspaceId, req.userId, "assistant", message);
    return { status: "requires_clarification", message, conversationId };
  }

  const candidateIds = new Set(candidates.map((c) => c.id));
  const validation = await validatePlan(plan, candidateIds, context);
  if (!validation.ok) {
    if (validation.requiresConnection) {
      const message = route.language === "da"
        ? `Forbind en udbyder for at fortsætte (${validation.requiresConnection.capability}).`
        : route.language === "de" ? `Verbinde einen Anbieter, um fortzufahren (${validation.requiresConnection.capability}).`
        : `Connect a provider to continue (${validation.requiresConnection.capability}).`;
      return { status: "requires_connection", message, requiredCapability: validation.requiresConnection.capability, providers: validation.requiresConnection.availableProviders, conversationId };
    }
    // §M/§L: hallucinated or invalid plans are rejected outright, never executed.
    return { status: "rejected", message: validation.reason, conversationId };
  }

  onStatus?.("executing");
  const { data: run, error: runError } = await db.from("ai_execution_runs").insert({
    company_id: req.workspaceId, user_id: req.userId, conversation_id: conversationId,
    intent: plan.intent, status: "executing", started_at: new Date().toISOString(), plan,
  }).select("id").single();
  if (runError) throw new Error(runError.message);

  const outcome = await executePlan(validation.steps, context);

  if (outcome.status === "requires_confirmation") {
    await db.from("ai_execution_runs").update({ status: "awaiting_confirmation" }).eq("id", run.id);
    const message = route.language === "da" ? `Jeg er klar til at ${outcome.pendingStep.capability.description.toLowerCase()}. Godkend for at fortsætte.`
      : route.language === "de" ? `Ich bin bereit: ${outcome.pendingStep.capability.description}. Bitte bestätigen.`
      : `I'm ready to: ${outcome.pendingStep.capability.description}. Confirm to continue.`;
    return { status: "requires_confirmation", confirmationId: run.id, message, conversationId };
  }
  if (outcome.status === "requires_clarification") {
    await db.from("ai_execution_runs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", run.id);
    return { status: "requires_clarification", message: outcome.question, conversationId };
  }

  await logExecutionSteps(db, run.id, outcome.records);
  const finalStatus = outcome.status === "completed" ? "completed" : outcome.status === "failed" ? "failed" : "partial";
  await db.from("ai_execution_runs").update({ status: finalStatus, completed_at: new Date().toISOString() }).eq("id", run.id);

  onStatus?.("completed");
  const message = await generateResponse(outcome.records, route.language);
  await appendMessage(db, conversationId, req.workspaceId, req.userId, "assistant", message);

  return { status: finalStatus, language: route.language, message, executionId: run.id, conversationId } as AIResponse;
}

export async function resumeConfirmedExecution(
  db: any,
  roles: import("./execution/execution.types.ts").Role[],
  authHeader: string,
  workspaceId: string,
  userId: string,
  confirmationId: string,
): Promise<AIResponse> {
  const { data: run } = await db.from("ai_execution_runs").select("*").eq("id", confirmationId).eq("company_id", workspaceId).eq("status", "awaiting_confirmation").maybeSingle();
  if (!run) return { status: "rejected", message: "No pending confirmation found for this workspace", conversationId: "" };

  const context: ExecutionContext = { db, workspaceId, userId, roles, authHeader };
  const candidateIds = new Set((run.plan.steps as { capability: string }[]).map((s) => s.capability));
  const validation = await validatePlan(run.plan, candidateIds, context);
  if (!validation.ok) return { status: "rejected", message: validation.reason, conversationId: run.conversation_id };

  // Atomic claim: the update only succeeds if the row is still
  // 'awaiting_confirmation'. If a double-click already claimed it, this
  // affects zero rows and we bail out instead of executing a second time.
  const { data: claimed } = await db.from("ai_execution_runs").update({ status: "executing" }).eq("id", confirmationId).eq("status", "awaiting_confirmation").select("id");
  if (!claimed?.length) return { status: "rejected", message: "This confirmation was already processed", conversationId: run.conversation_id };

  const confirmedIds = new Set<string>(run.plan.steps.map((s: { id: string }) => s.id)); // a run is a single confirmation unit — every step in it is confirmed once the run itself is confirmed
  const outcome = await executePlan(validation.steps, context, confirmedIds);
  if (outcome.status === "requires_confirmation" || outcome.status === "requires_clarification") {
    return { status: "rejected", message: "Unexpected pause after confirmation", conversationId: run.conversation_id };
  }

  await logExecutionSteps(db, confirmationId, outcome.records);
  const finalStatus = outcome.status === "completed" ? "completed" : outcome.status === "failed" ? "failed" : "partial";
  await db.from("ai_execution_runs").update({ status: finalStatus, completed_at: new Date().toISOString() }).eq("id", confirmationId);

  const language = run.plan.language ?? "en";
  const message = await generateResponse(outcome.records, language);
  await appendMessage(db, run.conversation_id, workspaceId, userId, "assistant", message);
  return { status: finalStatus, language, message, executionId: confirmationId, conversationId: run.conversation_id } as AIResponse;
}

async function logExecutionSteps(db: any, runId: string, records: StepExecutionRecord[]): Promise<void> {
  if (!records.length) return;
  await db.from("ai_execution_steps").insert(records.map((r) => ({
    execution_run_id: runId, capability: r.capability, provider: r.provider, status: r.status,
    input: r.input, output: r.output, error: r.error, duration_ms: r.durationMs,
  })));
}
