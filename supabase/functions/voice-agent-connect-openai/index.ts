import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PROVIDER_MODELS_URLS } from "../_shared/aiConnection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Historically OpenAI-only (hence the function/table names) — now also
// accepts Groq, an OpenAI-API-compatible provider with a genuinely free
// tier (no payment method required), as an alternative for tenants who
// don't want to add billing. Both providers use the exact same
// save/test/disconnect flow and the same openai_accounts row shape, just
// tagged with which provider the stored key belongs to.
const KEY_PREFIX: Record<string, string> = { openai: "sk-", groq: "gsk_" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) throw new Error("No company");

    const body = await req.json();
    const { action, apiKey } = body;
    const provider = (body.provider === "groq" ? "groq" : "openai") as "openai" | "groq";
    const providerLabel = provider === "groq" ? "Groq" : "OpenAI";

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "save") {
      const prefix = KEY_PREFIX[provider];
      if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith(prefix)) {
        throw new Error(`Ugyldigt ${providerLabel}-nøgleformat. Skal starte med ${prefix}`);
      }

      // Test the key against the provider's own models endpoint
      const testRes = await fetch(PROVIDER_MODELS_URLS[provider], {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!testRes.ok) {
        const err = await testRes.text();
        throw new Error(`${providerLabel}-nøglen kunne ikke bekræftes: ${testRes.status} ${err.slice(0, 200)}`);
      }

      // Upsert
      const { error: upsertErr } = await serviceClient
        .from("openai_accounts")
        .upsert({
          company_id: profile.company_id,
          provider,
          api_key: apiKey,
          status: "connected",
          last_tested_at: new Date().toISOString(),
          last_error: null,
          connected_by: user.id,
        }, { onConflict: "company_id" });

      if (upsertErr) throw new Error(upsertErr.message);

      return new Response(JSON.stringify({ success: true, status: "connected", provider }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "test") {
      const { data: acct } = await serviceClient
        .from("openai_accounts")
        .select("api_key, provider")
        .eq("company_id", profile.company_id)
        .single();
      if (!acct) throw new Error("Not connected");

      const acctProvider = (acct.provider === "groq" ? "groq" : "openai") as "openai" | "groq";
      const testRes = await fetch(PROVIDER_MODELS_URLS[acctProvider], {
        headers: { Authorization: `Bearer ${acct.api_key}` },
      });
      const ok = testRes.ok;
      await serviceClient.from("openai_accounts").update({
        status: ok ? "connected" : "error",
        last_tested_at: new Date().toISOString(),
        last_error: ok ? null : `HTTP ${testRes.status}`,
      }).eq("company_id", profile.company_id);

      return new Response(JSON.stringify({ success: ok, status: ok ? "connected" : "error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      await serviceClient.from("openai_accounts").delete().eq("company_id", profile.company_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (e) {
    console.error("voice-agent-connect-openai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
