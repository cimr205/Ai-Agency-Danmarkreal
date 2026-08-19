import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ECONOMIC_REQUEST_ACCESS_URL = "https://secure.e-conomic.com/secure/api1/requestaccess.aspx";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    const company_id = profile?.company_id;
    if (!company_id) {
      return new Response(JSON.stringify({ error: "No company associated" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appPublicToken = Deno.env.get("ECONOMIC_APP_PUBLIC_TOKEN");
    if (!appPublicToken) throw new Error("ECONOMIC_APP_PUBLIC_TOKEN not configured");

    const { redirect_uri, return_url } = await req.json().catch(() => ({}));
    const REDIRECT_URI = redirect_uri || `${Deno.env.get("SUPABASE_URL")}/functions/v1/economic-oauth-callback`;

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: stateRow, error: stateErr } = await supabase
      .from("oauth_states")
      .insert({
        company_id,
        provider: "economic",
        created_by: user.id,
        expires_at: expiresAt,
        metadata: { return_url: return_url || null },
      })
      .select("id")
      .single();

    if (stateErr || !stateRow) {
      console.error("Failed to create oauth state:", stateErr);
      throw new Error("Failed to start authorization");
    }

    // e-conomic appends "&token=<AgreementGrantToken>" to whatever redirectUrl we pass,
    // so we encode our own state as a query param on it.
    const redirectWithState = new URL(REDIRECT_URI);
    redirectWithState.searchParams.set("state", stateRow.id);

    const installUrl = new URL(ECONOMIC_REQUEST_ACCESS_URL);
    installUrl.searchParams.set("appPublicToken", appPublicToken);
    installUrl.searchParams.set("redirectUrl", redirectWithState.toString());

    return new Response(JSON.stringify({ authorize_url: installUrl.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("economic-oauth-start error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
