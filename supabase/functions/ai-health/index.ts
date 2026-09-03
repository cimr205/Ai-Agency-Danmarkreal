// Cheap health check for the shared self-hosted Ollama instance. Every
// real AI feature resolves the same model via _shared/aiConnection.ts —
// this just confirms it's reachable, without running a full completion.
import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getCompanyAI, AI_NOT_CONNECTED_MESSAGE } from "../_shared/aiConnection.ts";

Deno.serve(async (req) => {
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

    return new Response(JSON.stringify({ online: true, model: ai.model, provider: ai.provider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "AI health check failed", 503);
  }
});
