import { corsHeaders } from "../_shared/cors.ts";
import { requireCompanyAuth } from "../_shared/auth.ts";

const DINERO_AUTHORIZE_URL = "https://connect.visma.com/connect/authorize";
const DINERO_SCOPES = "dineropublicapi:read dineropublicapi:write offline_access";

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(input: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await requireCompanyAuth(req);
    if (ctx instanceof Response) return ctx;
    const { supabase, user, companyId: company_id } = ctx;

    const clientId = Deno.env.get("DINERO_CLIENT_ID");
    if (!clientId) throw new Error("DINERO_CLIENT_ID not configured");

    const { redirect_uri, return_url } = await req.json().catch(() => ({}));
    const REDIRECT_URI = redirect_uri || `${Deno.env.get("SUPABASE_URL")}/functions/v1/dinero-oauth-callback`;

    // PKCE
    const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const codeChallenge = base64url(await sha256(codeVerifier));

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: stateRow, error: stateErr } = await supabase
      .from("oauth_states")
      .insert({
        company_id,
        provider: "dinero",
        created_by: user.id,
        expires_at: expiresAt,
        metadata: { code_verifier: codeVerifier, redirect_uri: REDIRECT_URI, return_url: return_url || null },
      })
      .select("id")
      .single();

    if (stateErr || !stateRow) {
      console.error("Failed to create oauth state:", stateErr);
      throw new Error("Failed to start authorization");
    }

    const authorizeUrl = new URL(DINERO_AUTHORIZE_URL);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", DINERO_SCOPES);
    authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authorizeUrl.searchParams.set("state", stateRow.id);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return new Response(JSON.stringify({ authorize_url: authorizeUrl.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dinero-oauth-start error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
