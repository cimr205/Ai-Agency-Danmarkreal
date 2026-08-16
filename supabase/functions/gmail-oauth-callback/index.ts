import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      return redirectWithError(errorParam);
    }

    if (!code || !stateParam) {
      return redirectWithError("Missing code or state");
    }

    let state: { user_id: string };
    try {
      state = JSON.parse(atob(stateParam));
    } catch {
      return redirectWithError("Invalid state");
    }

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error("Token exchange error:", tokenData);
      return redirectWithError(tokenData.error_description || tokenData.error);
    }

    // Get user email from Google
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoRes.json();

    // Store tokens using service role
    const supabaseAdmin = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get user's company_id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("user_id", state.user_id)
      .single();

    if (!profile?.company_id) {
      return redirectWithError("No company found");
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Upsert email account
    const { error: upsertErr } = await supabaseAdmin
      .from("email_accounts")
      .upsert({
        user_id: state.user_id,
        company_id: profile.company_id,
        provider: "gmail",
        email_address: userInfo.email,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_expires_at: expiresAt,
        scopes: tokenData.scope || "",
        status: "connected",
        connected_at: new Date().toISOString(),
      }, {
        onConflict: "user_id,provider,email_address",
      });

    if (upsertErr) {
      console.error("Upsert error:", upsertErr);
      return redirectWithError("Failed to save connection");
    }

    // Log activity
    await supabaseAdmin.rpc("log_activity", {
      _user_id: state.user_id,
      _company_id: profile.company_id,
      _action_type: "gmail_connected",
      _entity_type: "email_account",
      _description: `Gmail forbundet: ${userInfo.email}`,
    });

    // Redirect back to app - use the Referer or fallback to known URLs
    const appUrl = getAppRedirectUrl();

    return new Response(null, {
      status: 302,
      headers: { Location: `${appUrl}/en/app/email/emails?gmail_connected=true` },
    });
  } catch (err) {
    console.error("gmail-oauth-callback error:", err);
    return redirectWithError(err.message);
  }
});

function getAppRedirectUrl(): string {
  // Try preview URL first, fallback to published
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const projectId = supabaseUrl.match(/https:\/\/(.+?)\.supabase\.co/)?.[1] || "";
  // Always redirect to published app URL
  return "https://bridge-orbit-core.lovable.app";
}

function redirectWithError(error: string) {
  const appUrl = getAppRedirectUrl();
  return new Response(null, {
    status: 302,
    headers: { Location: `${appUrl}/en/app/email/emails?gmail_error=${encodeURIComponent(error)}` },
  });
}
