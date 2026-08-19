import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ECONOMIC_API_BASE = "https://restapi.e-conomic.com";
const FALLBACK_RETURN_URL = "https://aiagencydanmark.dk/en/app/settings/company";

function errorRedirect(returnUrl: string, message: string): Response {
  const url = new URL(returnUrl);
  url.searchParams.set("economic", "error");
  url.searchParams.set("economic_error", message);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const state = url.searchParams.get("state");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!state) return errorRedirect(FALLBACK_RETURN_URL, "missing_state");

  const { data: stateRow } = await supabase
    .from("oauth_states")
    .select("*")
    .eq("id", state)
    .eq("provider", "economic")
    .is("consumed_at", null)
    .single();

  const returnUrl = (stateRow?.metadata as Record<string, unknown>)?.return_url as string || FALLBACK_RETURN_URL;

  try {
    if (!stateRow) return errorRedirect(returnUrl, "invalid_or_expired_state");
    if (new Date(stateRow.expires_at) < new Date()) return errorRedirect(returnUrl, "expired_state");
    if (!token) return errorRedirect(returnUrl, "user_declined_or_missing_token");

    await supabase.from("oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", state);

    const companyId = stateRow.company_id;
    const appSecretToken = Deno.env.get("ECONOMIC_APP_SECRET_TOKEN");
    if (!appSecretToken) throw new Error("ECONOMIC_APP_SECRET_TOKEN not configured");

    // Verify the grant token works and fetch the agreement info
    const selfRes = await fetch(`${ECONOMIC_API_BASE}/self`, {
      headers: {
        "X-AppSecretToken": appSecretToken,
        "X-AgreementGrantToken": token,
      },
    });
    const selfData = await selfRes.json().catch(() => null);
    if (!selfRes.ok) {
      console.error("e-conomic /self failed:", selfRes.status, selfData);
      return errorRedirect(returnUrl, "grant_token_invalid");
    }

    const { error: upsertErr } = await supabase
      .from("economic_connections")
      .upsert(
        {
          company_id: companyId,
          agreement_grant_token: token,
          agreement_number: selfData?.agreementNumber ?? null,
          company_name: selfData?.company?.name ?? null,
          status: "connected",
          connected_at: new Date().toISOString(),
          disconnected_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" },
      );

    if (upsertErr) {
      console.error("Failed to save e-conomic connection:", upsertErr);
      return errorRedirect(returnUrl, "save_failed");
    }

    const successUrl = new URL(returnUrl);
    successUrl.searchParams.set("economic", "connected");
    return new Response(null, { status: 302, headers: { Location: successUrl.toString() } });
  } catch (e) {
    console.error("economic-oauth-callback error:", e);
    return errorRedirect(returnUrl, "internal_error");
  }
});
