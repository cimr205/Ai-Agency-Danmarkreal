import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_APP_ID = "1461822492213512";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { code, redirect_uri } = await req.json();

    const REDIRECT_URI = redirect_uri || "https://bridge-orbit-core.lovable.app/auth/meta/callback";

    if (!code) {
      return new Response(JSON.stringify({ error: "Missing authorization code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Derive company_id from the authenticated user's own profile — never
    // trust a client-supplied company_id, which would let anyone attach their
    // own Meta ad accounts to a victim company.
    const profileClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: profile } = await profileClient
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    const company_id = profile?.company_id;
    if (!company_id) {
      return new Response(JSON.stringify({ error: "No company" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      console.error("META_APP_SECRET not configured");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Step 1: Exchange code for access token ---
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", META_APP_ID);
    tokenUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("code", code);

    console.log("Exchanging code for token...");
    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token exchange failed:", tokenData.error);
      return new Response(
        JSON.stringify({
          error: "Token exchange failed",
          detail: tokenData.error.message || tokenData.error,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shortToken = tokenData.access_token;
    if (!shortToken) {
      return new Response(JSON.stringify({ error: "No access token received" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Step 2: Exchange short-lived token for long-lived token ---
    const longTokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
    longTokenUrl.searchParams.set("client_id", META_APP_ID);
    longTokenUrl.searchParams.set("client_secret", appSecret);
    longTokenUrl.searchParams.set("fb_exchange_token", shortToken);

    console.log("Exchanging for long-lived token...");
    const longRes = await fetch(longTokenUrl.toString());
    const longData = await longRes.json();

    const accessToken = longData.access_token || shortToken;
    const expiresIn = longData.expires_in; // seconds
    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    // --- Step 3: Get Meta user info ---
    console.log("Fetching Meta user info...");
    const meRes = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${accessToken}`
    );
    const meData = await meRes.json();

    if (meData.error) {
      console.error("Failed to fetch Meta user:", meData.error);
      return new Response(
        JSON.stringify({ error: "Failed to verify Meta user", detail: meData.error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Step 4: Fetch ad accounts ---
    console.log("Fetching ad accounts...");
    const adAccountsRes = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_id,account_status,currency,business{id,name}&access_token=${accessToken}`
    );
    const adAccountsData = await adAccountsRes.json();

    const adAccounts = adAccountsData.data || [];
    console.log(`Found ${adAccounts.length} ad accounts`);

    // --- Step 5: Save to database using service role ---
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Upsert meta connection
    const { data: connection, error: connError } = await supabase
      .from("meta_connections")
      .upsert(
        {
          company_id,
          meta_user_id: meData.id,
          meta_user_name: meData.name,
          access_token: accessToken,
          token_expires_at: tokenExpiresAt,
          status: "connected",
          connected_at: new Date().toISOString(),
          disconnected_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      )
      .select()
      .single();

    if (connError) {
      console.error("Failed to save connection:", connError);
      return new Response(
        JSON.stringify({ error: "Failed to save connection", detail: connError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete old ad accounts for this company, then insert new ones
    await supabase
      .from("meta_ad_accounts")
      .delete()
      .eq("company_id", company_id);

    if (adAccounts.length > 0) {
      const accountRows = adAccounts.map((acc: any) => ({
        company_id,
        meta_connection_id: connection.id,
        account_id: acc.account_id || acc.id,
        account_name: acc.name || null,
        business_id: acc.business?.id || null,
        business_name: acc.business?.name || null,
        currency: acc.currency || null,
        account_status: acc.account_status || null,
      }));

      const { error: accError } = await supabase
        .from("meta_ad_accounts")
        .insert(accountRows);

      if (accError) {
        console.error("Failed to save ad accounts:", accError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        meta_user: { id: meData.id, name: meData.name },
        ad_accounts_count: adAccounts.length,
        status: "connected",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
