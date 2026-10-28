// Cheap health check for the shared self-hosted Ollama instance. Every
// real AI feature resolves the same model via _shared/aiConnection.ts —
// this just confirms it's reachable, without running a full completion.
import { withSentry } from "../_shared/sentry.ts";
import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getCompanyAI, AI_NOT_CONNECTED_MESSAGE } from "../_shared/aiConnection.ts";

Deno.serve(withSentry("ai-health", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const ctx = await requireCompanyAuth(req);
  if (ctx instanceof Response) return ctx;
  const { supabase, companyId } = ctx;

  try {
    const ai = await getCompanyAI(supabase, companyId);
    if (!ai) throw new Error(AI_NOT_CONNECTED_MESSAGE);

    const modelsUrl = ai.url.replace(/\/chat\/completions$/, "/models");
    const res = await fetch(modelsUrl, { headers: { Authorization: `Bearer ${ai.apiKey}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Modellen svarede ikke korrekt (HTTP ${res.status}).`);
    // Reachable isn't enough: OpenRouter retires model ids, and every AI call
    // then fails with 404 while this check still said "online". Confirm the
    // configured model is actually offered.
    const list = await res.json().catch(() => null) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string; model?: string }> } | null;
    const ids = [
      ...(list?.data ?? []).map((m) => m.id),
      ...(list?.models ?? []).flatMap((m) => [m.name, m.model]),
    ].filter((id): id is string => typeof id === "string");
    if (ids.length > 0 && !ids.includes(ai.model)) {
      throw new Error(`Modellen "${ai.model}" findes ikke længere hos udbyderen. Opdatér LOCAL_LLM_MODEL. / The model "${ai.model}" is no longer offered by the provider. Update LOCAL_LLM_MODEL.`);
    }

    return new Response(JSON.stringify({ online: true, model: ai.model, provider: ai.provider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "AI health check failed", 503);
  }
}));
