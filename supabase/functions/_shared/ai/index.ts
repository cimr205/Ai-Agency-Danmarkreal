/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
import { RequestRouter } from "./router/request-router.ts";
import { matchFastIntent } from "./router/fast-intent-router.ts";
import { buildDomainContext } from "./context/context-builder.ts";
import { searchCapabilities } from "./capabilities/capability-search.ts";
import { registerCoreCapabilities } from "./capabilities/core-capabilities.ts";
import { CapabilityRegistry } from "./capabilities/capability-registry.ts";
import { generatePlan } from "./planning/planner.ts";
import { validatePlan } from "./planning/plan-validator.ts";
import { executePlan, type StepExecutionRecord } from "./execution/execution-engine.ts";
import { generateResponse } from "./response/response-generator.ts";
import { loadRecentMessages, appendMessage, getOrCreateConversation } from "./memory/conversation-memory.ts";
import { AIModel } from "./model/model-router.ts";
import { RateLimitedError, ProviderUnavailableError } from "./providers/model-provider.types.ts";
import { SYSTEM_IDENTITY } from "./prompts/system.ts";
import type { ExecutionContext } from "./execution/execution.types.ts";
import type { PlanSchema } from "./planning/plan.schema.ts";
import type { z } from "npm:zod@3.23.8";

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
  | { status: "answer"; language: string; message: string; conversationId: string; timings: Timings }
  | { status: "completed"; language: string; message: string; executionId: string; conversationId: string; timings: Timings }
  | { status: "partial"; language: string; message: string; executionId: string; conversationId: string; timings: Timings }
  | { status: "failed"; language: string; message: string; errorCode: string; executionId: string; conversationId: string; timings: Timings }
  | { status: "requires_connection"; message: string; requiredCapability: string; providers: string[]; conversationId: string; timings: Timings }
  | { status: "requires_confirmation"; confirmationId: string; message: string; conversationId: string; timings: Timings }
  | { status: "requires_clarification"; message: string; conversationId: string; timings: Timings }
  | { status: "rejected"; message: string; conversationId: string; timings: Timings };

interface Timings { routing_ms: number; context_ms: number; llm_ms: number; planning_ms: number; execution_ms: number; total_ms: number }

function emptyTimings(): Timings {
  return { routing_ms: 0, context_ms: 0, llm_ms: 0, planning_ms: 0, execution_ms: 0, total_ms: 0 };
}

type Plan = z.infer<typeof PlanSchema>;

export async function handleAIMessage(
  db: any,
  roles: import("./execution/execution.types.ts").Role[],
  authHeader: string,
  req: AIRequest,
  onStatus?: (status: string) => void,
): Promise<AIResponse> {
  const totalStart = Date.now();
  const timings = emptyTimings();
  const conversationId = await getOrCreateConversation(db, req.workspaceId, req.userId, req.conversationId);
  await appendMessage(db, conversationId, req.workspaceId, req.userId, "user", req.message);

  onStatus?.("thinking");

  // §7/§9: FastIntentRouter — checked before anything else touches the
  // model provider. A high-confidence match executes immediately with
  // zero LLM calls, going through the exact same validate→permission→
  // connection→execute pipeline as a planned step, just skipping planning.
  let routingStart = Date.now();
  const fastIntent = matchFastIntent(req.message);
  timings.routing_ms = Date.now() - routingStart;

  if (fastIntent.matched) {
    const capability = CapabilityRegistry.get(fastIntent.capability);
    if (capability) {
      const context: ExecutionContext = { db, workspaceId: req.workspaceId, userId: req.userId, roles, authHeader };
      const fastPlan: Plan = {
        language: fastIntent.language, intent: fastIntent.capability, requiresClarification: false, clarificationQuestion: null,
        steps: [{ id: "step_1", capability: fastIntent.capability, input: fastIntent.parameters, dependsOn: [] }],
      };
      const validation = await validatePlan(fastPlan, new Set([fastIntent.capability]), context);
      if (validation.ok) {
        onStatus?.("executing");
        const execStart = Date.now();
        const outcome = await executePlan(validation.steps, context);
        timings.execution_ms = Date.now() - execStart;
        if (outcome.status === "completed" || outcome.status === "partial" || outcome.status === "failed") {
          const { data: run } = await db.from("ai_execution_runs").insert({
            company_id: req.workspaceId, user_id: req.userId, conversation_id: conversationId,
            intent: fastIntent.capability, status: outcome.status, started_at: new Date(totalStart).toISOString(),
            completed_at: new Date().toISOString(), plan: fastPlan,
          }).select("id").single();
          if (run) await logExecutionSteps(db, run.id, outcome.records);
          const message = await generateResponse(outcome.records, fastIntent.language);
          await appendMessage(db, conversationId, req.workspaceId, req.userId, "assistant", message);
          timings.total_ms = Date.now() - totalStart;
          if (outcome.status === "failed") {
            return { status: "failed", language: fastIntent.language, message, errorCode: "EXECUTION_FAILED", executionId: run?.id ?? "", conversationId, timings };
          }
          return { status: outcome.status, language: fastIntent.language, message, executionId: run?.id ?? "", conversationId, timings };
        }
        // fast intents are always single-step reads — confirmation/clarification should never occur, but fall through safely if it somehow does
      }
    }
  }

  routingStart = Date.now();
  const route = await RequestRouter.route(req.message);
  timings.routing_ms += Date.now() - routingStart;

  if (route.domain === "unknown" || route.actionType === "answer") {
    const memory = await loadRecentMessages(db, conversationId, req.workspaceId);
    let reply: string;
    const llmStart = Date.now();
    try {
      reply = await AIModel.generate([{ role: "system", content: SYSTEM_IDENTITY }, ...memory, { role: "user", content: req.message }]);
    } catch (e) {
      reply = unavailableMessage(route.language, e);
    }
    timings.llm_ms = Date.now() - llmStart;
    await appendMessage(db, conversationId, req.workspaceId, req.userId, "assistant", reply);
    timings.total_ms = Date.now() - totalStart;
    return { status: "answer", language: route.language, message: reply, conversationId, timings };
  }

  onStatus?.("planning");
  const contextStart = Date.now();
  const context: ExecutionContext = { db, workspaceId: req.workspaceId, userId: req.userId, roles, authHeader };
  const domainContext = await buildDomainContext(route.domain, context);
  const candidates = searchCapabilities(req.message, route.domain, roles);
  const memory = await loadRecentMessages(db, conversationId, req.workspaceId);
  timings.context_ms = Date.now() - contextStart;

  const planningStart = Date.now();
  let planned;
  try {
    planned = await generatePlan(`${req.message}\n\n[context: ${JSON.stringify(domainContext)}]`, route.language, candidates, memory);
  } catch (e) {
    timings.planning_ms = Date.now() - planningStart;
    timings.total_ms = Date.now() - totalStart;
    return errorResponse(e, route.language, conversationId, timings);
  }
  timings.planning_ms = Date.now() - planningStart;

  if (!planned.ok || !planned.plan) {
    const message = route.language === "da" ? "Jeg kunne ikke lave en gyldig plan for det." : route.language === "de" ? "Dafür konnte ich keinen gültigen Plan erstellen." : "I couldn't produce a valid plan for that.";
    timings.total_ms = Date.now() - totalStart;
    return { status: "failed", language: route.language, message, errorCode: "INVALID_PLAN", executionId: "", conversationId, timings };
  }
  const plan = planned.plan;

  if (plan.requiresClarification) {
    const message = plan.clarificationQuestion ?? "Can you clarify?";
    await appendMessage(db, conversationId, req.workspaceId, req.userId, "assistant", message);
    timings.total_ms = Date.now() - totalStart;
    return { status: "requires_clarification", message, conversationId, timings };
  }

  const candidateIds = new Set(candidates.map((c) => c.id));
  const validation = await validatePlan(plan, candidateIds, context);
  if (!validation.ok) {
    timings.total_ms = Date.now() - totalStart;
    if (validation.requiresConnection) {
      const message = route.language === "da"
        ? `Forbind en udbyder for at fortsætte (${validation.requiresConnection.capability}).`
        : route.language === "de" ? `Verbinde einen Anbieter, um fortzufahren (${validation.requiresConnection.capability}).`
        : `Connect a provider to continue (${validation.requiresConnection.capability}).`;
      return { status: "requires_connection", message, requiredCapability: validation.requiresConnection.capability, providers: validation.requiresConnection.availableProviders, conversationId, timings };
    }
    // §M/§L: hallucinated or invalid plans are rejected outright, never executed.
    return { status: "rejected", message: validation.reason, conversationId, timings };
  }

  onStatus?.("executing");
  const { data: run, error: runError } = await db.from("ai_execution_runs").insert({
    company_id: req.workspaceId, user_id: req.userId, conversation_id: conversationId,
    intent: plan.intent, status: "executing", started_at: new Date().toISOString(), plan,
  }).select("id").single();
  if (runError) throw new Error(runError.message);

  const execStart = Date.now();
  const outcome = await executePlan(validation.steps, context);
  timings.execution_ms = Date.now() - execStart;

  if (outcome.status === "requires_confirmation") {
    await db.from("ai_execution_runs").update({ status: "awaiting_confirmation" }).eq("id", run.id);
    const message = route.language === "da" ? `Jeg er klar til at ${outcome.pendingStep.capability.description.toLowerCase()}. Godkend for at fortsætte.`
      : route.language === "de" ? `Ich bin bereit: ${outcome.pendingStep.capability.description}. Bitte bestätigen.`
      : `I'm ready to: ${outcome.pendingStep.capability.description}. Confirm to continue.`;
    timings.total_ms = Date.now() - totalStart;
    return { status: "requires_confirmation", confirmationId: run.id, message, conversationId, timings };
  }
  if (outcome.status === "requires_clarification") {
    await db.from("ai_execution_runs").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", run.id);
    timings.total_ms = Date.now() - totalStart;
    return { status: "requires_clarification", message: outcome.question, conversationId, timings };
  }

  await logExecutionSteps(db, run.id, outcome.records);
  const finalStatus = outcome.status === "completed" ? "completed" : outcome.status === "failed" ? "failed" : "partial";
  await db.from("ai_execution_runs").update({ status: finalStatus, completed_at: new Date().toISOString() }).eq("id", run.id);

  onStatus?.("completed");
  const message = await generateResponse(outcome.records, route.language);
  await appendMessage(db, conversationId, req.workspaceId, req.userId, "assistant", message);
  timings.total_ms = Date.now() - totalStart;

  if (finalStatus === "failed") {
    return { status: "failed", language: route.language, message, errorCode: "EXECUTION_FAILED", executionId: run.id, conversationId, timings };
  }
  return { status: finalStatus, language: route.language, message, executionId: run.id, conversationId, timings } as AIResponse;
}

function unavailableMessage(language: string, e: unknown): string {
  if (e instanceof RateLimitedError) {
    return language === "da" ? "AI-modellen er midlertidigt overbelastet, prøv igen om lidt." : language === "de" ? "Das KI-Modell ist vorübergehend überlastet, bitte versuche es gleich noch einmal." : "The AI model is temporarily rate-limited, try again shortly.";
  }
  return language === "da" ? "AI-modellen svarer ikke lige nu." : language === "de" ? "Das KI-Modell antwortet derzeit nicht." : "The AI model is not responding right now.";
}

function errorResponse(e: unknown, language: string, conversationId: string, timings: Timings): AIResponse {
  if (e instanceof RateLimitedError) {
    const message = language === "da" ? "AI-modellen er midlertidigt overbelastet." : language === "de" ? "Das KI-Modell ist vorübergehend überlastet." : "The AI model is temporarily rate-limited.";
    return { status: "failed", language, message, errorCode: "GROQ_RATE_LIMITED", executionId: "", conversationId, timings };
  }
  if (e instanceof ProviderUnavailableError) {
    const message = language === "da" ? "AI-modellen er ikke tilgængelig lige nu." : language === "de" ? "Das KI-Modell ist derzeit nicht verfügbar." : "The AI model is temporarily unavailable.";
    return { status: "failed", language, message, errorCode: "AI_TEMPORARILY_UNAVAILABLE", executionId: "", conversationId, timings };
  }
  const message = e instanceof Error ? e.message : "Unknown error";
  return { status: "failed", language, message, errorCode: "UNKNOWN_ERROR", executionId: "", conversationId, timings };
}

export async function resumeConfirmedExecution(
  db: any,
  roles: import("./execution/execution.types.ts").Role[],
  authHeader: string,
  workspaceId: string,
  userId: string,
  confirmationId: string,
): Promise<AIResponse> {
  const timings = emptyTimings();
  const { data: run } = await db.from("ai_execution_runs").select("*").eq("id", confirmationId).eq("company_id", workspaceId).eq("status", "awaiting_confirmation").maybeSingle();
  if (!run) return { status: "rejected", message: "No pending confirmation found for this workspace", conversationId: "", timings };

  const context: ExecutionContext = { db, workspaceId, userId, roles, authHeader };
  const candidateIds = new Set((run.plan.steps as { capability: string }[]).map((s) => s.capability));
  const validation = await validatePlan(run.plan, candidateIds, context);
  if (!validation.ok) return { status: "rejected", message: validation.reason, conversationId: run.conversation_id, timings };

  // Atomic claim: the update only succeeds if the row is still
  // 'awaiting_confirmation'. If a double-click already claimed it, this
  // affects zero rows and we bail out instead of executing a second time.
  const { data: claimed } = await db.from("ai_execution_runs").update({ status: "executing" }).eq("id", confirmationId).eq("status", "awaiting_confirmation").select("id");
  if (!claimed?.length) return { status: "rejected", message: "This confirmation was already processed", conversationId: run.conversation_id, timings };

  const confirmedIds = new Set<string>(run.plan.steps.map((s: { id: string }) => s.id)); // a run is a single confirmation unit — every step in it is confirmed once the run itself is confirmed
  const execStart = Date.now();
  const outcome = await executePlan(validation.steps, context, confirmedIds);
  timings.execution_ms = Date.now() - execStart;
  if (outcome.status === "requires_confirmation" || outcome.status === "requires_clarification") {
    return { status: "rejected", message: "Unexpected pause after confirmation", conversationId: run.conversation_id, timings };
  }

  await logExecutionSteps(db, confirmationId, outcome.records);
  const finalStatus = outcome.status === "completed" ? "completed" : outcome.status === "failed" ? "failed" : "partial";
  await db.from("ai_execution_runs").update({ status: finalStatus, completed_at: new Date().toISOString() }).eq("id", confirmationId);

  const language = run.plan.language ?? "en";
  const message = await generateResponse(outcome.records, language);
  await appendMessage(db, run.conversation_id, workspaceId, userId, "assistant", message);
  if (finalStatus === "failed") {
    return { status: "failed", language, message, errorCode: "EXECUTION_FAILED", executionId: confirmationId, conversationId: run.conversation_id, timings };
  }
  return { status: finalStatus, language, message, executionId: confirmationId, conversationId: run.conversation_id, timings } as AIResponse;
}

async function logExecutionSteps(db: any, runId: string, records: StepExecutionRecord[]): Promise<void> {
  if (!records.length) return;
  await db.from("ai_execution_steps").insert(records.map((r) => ({
    execution_run_id: runId, capability: r.capability, provider: r.provider, status: r.status,
    input: r.input, output: r.output, error: r.error, duration_ms: r.durationMs,
  })));
}
