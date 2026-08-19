import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DINERO_TOKEN_URL = "https://connect.visma.com/connect/token";
const DINERO_API_BASE = "https://api.dinero.dk/v1";
const FALLBACK_RETURN_URL = "https://aiagencydanmark.dk/en/app/settings/company";

function errorRedirect(returnUrl: string, message: string): Response {
  const url = new URL(returnUrl);
  url.searchParams.set("dinero", "error");
  url.searchParams.set("dinero_error", message);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!state) return errorRedirect(FALLBACK_RETURN_URL, "missing_state");

  const { data: stateRow } = await supabase
    .from("oauth_states")
    .select("*")
    .eq("id", state)
    .eq("provider", "dinero")
    .is("consumed_at", null)
    .single();

  const returnUrl = (stateRow?.metadata as Record<string, unknown>)?.return_url as string || FALLBACK_RETURN_URL;

  try {
    if (!stateRow) return errorRedirect(returnUrl, "invalid_or_expired_state");
    if (new Date(stateRow.expires_at) < new Date()) return errorRedirect(returnUrl, "expired_state");
    if (oauthError) return errorRedirect(returnUrl, oauthError);
    if (!code) return errorRedirect(returnUrl, "missing_code");

    // Consume immediately so the state can't be replayed
    await supabase.from("oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", state);

    const metadata = stateRow.metadata as Record<string, string>;
    const codeVerifier = metadata.code_verifier;
    const redirectUri = metadata.redirect_uri;
    const companyId = stateRow.company_id;

    const clientId = Deno.env.get("DINERO_CLIENT_ID");
    const clientSecret = Deno.env.get("DINERO_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("Dinero credentials not configured");

    // --- Exchange code for tokens ---
    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenRes = await fetch(DINERO_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Dinero token exchange failed:", tokenData);
      return errorRedirect(returnUrl, "token_exchange_failed");
    }

    const accessToken = tokenData.access_token as string;
    const refreshToken = tokenData.refresh_token as string;
    const expiresIn = tokenData.expires_in as number; // seconds
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // --- Find which Dinero organization this token can access ---
    const orgsRes = await fetch(`${DINERO_API_BASE}/organizations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const orgs = await orgsRes.json().catch(() => []);
    const org = Array.isArray(orgs) ? orgs[0] : null;

    if (!org?.organizationId) {
      console.error("No Dinero organization found for token:", orgs);
      return errorRedirect(returnUrl, "no_organization");
    }

    const { error: upsertErr } = await supabase
      .from("dinero_connections")
      .upsert(
        {
          company_id: companyId,
          dinero_organization_id: String(org.organizationId),
          dinero_organization_name: org.name || null,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
          status: "connected",
          connected_at: new Date().toISOString(),
          disconnected_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );

    if (upsertErr) {
      console.error("Failed to save Dinero connection:", upsertErr);
      return errorRedirect(returnUrl, "save_failed");
    }

    const successUrl = new URL(returnUrl);
    successUrl.searchParams.set("dinero", "connected");
    return new Response(null, { status: 302, headers: { Location: successUrl.toString() } });
  } catch (e) {
    console.error("dinero-oauth-callback error:", e);
    return errorRedirect(returnUrl, "internal_error");
  }
});
