import { corsHeaders } from "../_shared/cors.ts";
import { requireCompanyAuth } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await requireCompanyAuth(req);
    if (ctx instanceof Response) return ctx;
    const { supabase, companyId: company_id } = ctx;

    const { provider } = await req.json();
    if (provider !== "dinero" && provider !== "economic") {
      return new Response(JSON.stringify({ error: "provider must be 'dinero' or 'economic'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const table = provider === "dinero" ? "dinero_connections" : "economic_connections";
    const revokedFields = provider === "dinero"
      ? { access_token: "revoked", refresh_token: "revoked" }
      : { agreement_grant_token: "revoked" };

    const { error } = await supabase
      .from(table)
      .update({
        status: "disconnected",
        disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...revokedFields,
      })
      .eq("company_id", company_id);

    if (error) {
      return new Response(JSON.stringify({ error: "Failed to disconnect", detail: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
