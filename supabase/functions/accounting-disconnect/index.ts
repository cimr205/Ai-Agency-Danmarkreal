import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    const company_id = profile?.company_id;
    if (!company_id) {
      return new Response(JSON.stringify({ error: "No company" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
