// Public entrypoint for the AI Action Engine — POST /api/ai/message
// equivalent (this function's own invoke URL). userId/workspaceId are
// always resolved server-side from the auth token via requireCompanyAuth;
// the request body is never trusted for either (§V/§F).
import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { loadRoles } from "../_shared/ai/context/workspace-context.ts";
import { handleAIMessage, resumeConfirmedExecution } from "../_shared/ai/index.ts";
import { AIModel } from "../_shared/ai/model/model-router.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonError("Method not allowed", 405);

  const ctx = await requireCompanyAuth(req);
  if (ctx instanceof Response) return ctx;
  const { supabase: db, companyId, user } = ctx;
  const authHeader = req.headers.get("Authorization")!;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError("Invalid JSON", 400); }

  if (body.operation === "health") {
    const health = await AIModel.healthCheck();
    return new Response(JSON.stringify({ ...health, provider: AIModel.name }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const roles = await loadRoles(db, user.id);
  if (!roles.length) return jsonError("No workspace role", 403);

  try {
    // Confirming a previously-paused plan.
    if (typeof body.confirmationId === "string") {
      const result = await resumeConfirmedExecution(db, roles, authHeader, companyId, user.id, body.confirmationId);
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (typeof body.message !== "string" || !body.message.trim()) return jsonError("message is required", 400);

    // §X: streaming status events for normal requests. Tool execution
    // itself never depends on the stream being read — if the client
    // disconnects mid-stream, execution already ran server-side and was
    // logged; nothing is lost, only the live status updates.
    if (body.stream === true) {
      const encoder = new TextEncoder();
      const streamBody = new ReadableStream({
        async start(controller) {
          const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          try {
            const result = await handleAIMessage(db, roles, authHeader, {
              workspaceId: companyId, userId: user.id, message: body.message as string,
              conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
              locale: typeof body.locale === "string" ? (body.locale as "da" | "en" | "de") : undefined,
            }, (status) => send({ type: "status", value: status }));
            send({ type: "complete", value: result });
          } catch (e) {
            send({ type: "error", value: e instanceof Error ? e.message : "Unknown error" });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(streamBody, { headers: { ...corsHeaders, "Content-Type": "application/x-ndjson" } });
    }

    const result = await handleAIMessage(db, roles, authHeader, {
      workspaceId: companyId, userId: user.id, message: body.message as string,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      locale: typeof body.locale === "string" ? (body.locale as "da" | "en" | "de") : undefined,
    });
    // §26: per-request latency breakdown, so it's obvious where time went
    // without needing to reproduce a slow request to diagnose it.
    if ("timings" in result) console.log(`[ai-message] status=${result.status} timings=${JSON.stringify(result.timings)}`);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    // §AD/§23 failsafe: a model-offline or unexpected error becomes a
    // clean 503/500 JSON response, never an unhandled crash of the
    // function — Fast Path requests never reach this catch at all since
    // they don't touch the model provider.
    const message = error instanceof Error ? error.message : "AI engine failed";
    const status = /ollama|groq|model|timeout|fetch failed|rate limit/i.test(message) ? 503 : 500;
    return jsonError(message, status);
  }
});
