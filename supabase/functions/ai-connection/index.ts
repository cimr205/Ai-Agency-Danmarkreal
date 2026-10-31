import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Lets a company connect its own OpenAI account (API key) as the AI
// provider every AI feature in the app uses — same "connect once, use
// everywhere" principle as the Composio integrations layer. OpenAI isn't a
// Composio toolkit (it's a raw API key, not an OAuth data source), so this
// is its own small, generic-by-provider service instead of routed through
// composio-integration.

const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
};
const PROVIDER_MODELS_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/models",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await requireCompanyAuth(req);
  if (ctx instanceof Response) return ctx;
  const { supabase, user, companyId } = ctx;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // no body
  }
  const action = body.action as string | undefined;

  // requireCompanyAuth uses a service-role client (RLS is bypassed), so the
  // admin-only requirement on connecting/disconnecting the company's AI
  // provider must be enforced explicitly here, not left to the table's RLS
  // policy alone.
  async function requireAdmin() {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["system_admin", "company_admin"]);
    if (!data || data.length === 0) throw new Error("Kun virksomhedsadministratorer kan ændre AI-forbindelsen.");
  }

  try {
    if (action === "status") {
      const { data } = await supabase
        .from("ai_connections")
        .select("provider, model, status, last_verified_at, last_error")
        .eq("company_id", companyId)
        .maybeSingle();
      return jsonResponse({ connection: data ?? null });
    }

    if (action === "connect") {
      await requireAdmin();
      const provider = ((body.provider as string) || "openai").toLowerCase();
      const apiKey = (body.apiKey as string || "").trim();
      const model = (body.model as string) || "gpt-4o-mini";

      if (!PROVIDER_URLS[provider]) throw new Error(`Udbyderen "${provider}" understøttes ikke endnu.`);
      if (!apiKey) throw new Error("API-nøgle mangler.");

      // Validate the key actually works before storing it — a cheap,
      // no-token-cost call against the provider's own models endpoint.
      const verifyRes = await fetch(PROVIDER_MODELS_URLS[provider], {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!verifyRes.ok) {
        const errBody = await verifyRes.text().catch(() => "");
        throw new Error(`Nøglen blev afvist af ${provider} (HTTP ${verifyRes.status}). Tjek at den er korrekt og har adgang.${errBody ? ` ${errBody.slice(0, 200)}` : ""}`);
      }

      const { error: upsertError } = await supabase.from("ai_connections").upsert(
        {
          company_id: companyId,
          provider,
          api_key: apiKey,
          model,
          status: "connected",
          last_verified_at: new Date().toISOString(),
          last_error: null,
          connected_by: user.id,
        },
        { onConflict: "company_id,provider" },
      );
      if (upsertError) throw new Error(upsertError.message);

      return jsonResponse({ success: true, provider, model });
    }

    if (action === "disconnect") {
      await requireAdmin();
      const provider = ((body.provider as string) || "openai").toLowerCase();
      const { error: deleteError } = await supabase
        .from("ai_connections")
        .delete()
        .eq("company_id", companyId)
        .eq("provider", provider);
      if (deleteError) throw new Error(deleteError.message);
      return jsonResponse({ success: true });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 400);
  }
});

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
