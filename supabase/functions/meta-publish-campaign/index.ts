import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const META_API_VERSION = "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Du er ikke logget ind. Log ind igen og prøv.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Du er ikke logget ind. Log ind igen og prøv.");

    // Get company ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) throw new Error("Din profil er ikke knyttet til en virksomhed.");

    const companyId = profile.company_id;

    // Get Meta connection
    const { data: conn } = await supabase
      .from("meta_connections")
      .select("access_token, status")
      .eq("company_id", companyId)
      .eq("status", "connected")
      .single();
    if (!conn) throw new Error("Meta Ads er ikke forbundet. Forbind din konto først.");

    const accessToken = conn.access_token;

    // Get ad account
    const { data: adAccounts } = await supabase
      .from("meta_ad_accounts")
      .select("account_id")
      .eq("company_id", companyId)
      .limit(1);
    if (!adAccounts || adAccounts.length === 0)
      throw new Error("Ingen annonce-konto fundet. Forbind din Meta Ads konto.");

    const adAccountId = adAccounts[0].account_id;
    const body = await req.json();

    const {
      campaign_name,
      objective,
      daily_budget,
      campaign_daily_budget,
      budget_level,
      status,
      start_time,
      end_time,
      targeting,
      ad_creative,
      schedule,
    } = body;

    const isCampaignBudget = budget_level === "campaign";

    // 1. Create Campaign
    const campaignParams = new URLSearchParams({
      name: campaign_name,
      objective: objective || "OUTCOME_TRAFFIC",
      status: status || "ACTIVE",
      special_ad_categories: "[]",
      is_budget_schedule_enabled: "false",
      access_token: accessToken,
    });

    // If campaign-level budget, set daily_budget on campaign
    if (isCampaignBudget && campaign_daily_budget) {
      campaignParams.set("daily_budget", String(campaign_daily_budget));
    }

    const campaignRes = await fetch(
      `${META_API_BASE}/act_${adAccountId}/campaigns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: campaignParams.toString(),
      }
    );

    const campaignData = await campaignRes.json();
    if (campaignData.error) {
      throw new Error(
        `Kampagne kunne ikke oprettes: ${campaignData.error.error_user_msg || campaignData.error.message}`
      );
    }
    const campaignId = campaignData.id;

    // 2. Create Ad Set
    const adSetBody: Record<string, unknown> = {
      name: `${campaign_name} – Ad Set`,
      campaign_id: campaignId,
      billing_event: "IMPRESSIONS",
      optimization_goal: objective === "OUTCOME_TRAFFIC" ? "LINK_CLICKS" :
                         objective === "OUTCOME_LEADS" ? "LEAD_GENERATION" :
                         objective === "OUTCOME_SALES" ? "OFFSITE_CONVERSIONS" :
                         objective === "OUTCOME_AWARENESS" ? "REACH" : "LINK_CLICKS",
      status: status || "ACTIVE",
      targeting: JSON.stringify(targeting || { geo_locations: { countries: ["DK"] }, age_min: 18, age_max: 65 }),
      access_token: accessToken,
    };

    // Only set daily_budget on ad set if not using campaign-level budget
    if (!isCampaignBudget) {
      adSetBody.daily_budget = daily_budget || 5000;
    }

    if (start_time) adSetBody.start_time = start_time;
    if (end_time) adSetBody.end_time = end_time;

    const adSetParams = new URLSearchParams();
    Object.entries(adSetBody).forEach(([k, v]) => adSetParams.set(k, String(v)));

    const adSetRes = await fetch(
      `${META_API_BASE}/act_${adAccountId}/adsets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: adSetParams.toString(),
      }
    );

    const adSetData = await adSetRes.json();
    if (adSetData.error) {
      throw new Error(`Annonce-sæt kunne ikke oprettes: ${adSetData.error.error_user_msg || adSetData.error.message}`);
    }
    const adSetId = adSetData.id;

    // 3. Create Ad Creative
    const creativeBody: Record<string, unknown> = {
      name: `${campaign_name} – Creative`,
      access_token: accessToken,
    };

    // Build object story spec
    interface StorySpec {
      link_data: {
        message: string;
        link: string;
        name: string;
        description: string;
        call_to_action: { type: string; value: { link: string } };
        picture?: string;
      };
      page_id?: string;
    }
    const storySpec: StorySpec = {
      link_data: {
        message: ad_creative?.primary_text || "",
        link: ad_creative?.link_url || "https://example.com",
        name: ad_creative?.headline || campaign_name,
        description: ad_creative?.description || "",
        call_to_action: {
          type: ad_creative?.call_to_action || "LEARN_MORE",
          value: { link: ad_creative?.link_url || "https://example.com" },
        },
      },
    };

    if (ad_creative?.image_url) {
      storySpec.link_data.picture = ad_creative.image_url;
    }

    // Get page ID (needed for ad creative)
    const pagesRes = await fetch(
      `${META_API_BASE}/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesRes.json();
    const pageId = pagesData.data?.[0]?.id;

    if (pageId) {
      storySpec.page_id = pageId;
    }

    creativeBody.object_story_spec = JSON.stringify(storySpec);

    const creativeParams = new URLSearchParams();
    Object.entries(creativeBody).forEach(([k, v]) =>
      creativeParams.set(k, String(v))
    );

    const creativeRes = await fetch(
      `${META_API_BASE}/act_${adAccountId}/adcreatives`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: creativeParams.toString(),
      }
    );

    const creativeData = await creativeRes.json();
    if (creativeData.error) {
      throw new Error(
        `Annonce-kreativ kunne ikke oprettes: ${creativeData.error.error_user_msg || creativeData.error.message}`
      );
    }
    const creativeId = creativeData.id;

    // 4. Create Ad
    const adParams = new URLSearchParams({
      name: `${campaign_name} – Ad`,
      adset_id: adSetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: status || "ACTIVE",
      access_token: accessToken,
    });

    const adRes = await fetch(`${META_API_BASE}/act_${adAccountId}/ads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: adParams.toString(),
    });

    const adData = await adRes.json();
    if (adData.error) {
      throw new Error(`Annonce kunne ikke oprettes: ${adData.error.error_user_msg || adData.error.message}`);
    }

    // Log activity
    await supabase.rpc("log_activity", {
      _user_id: user.id,
      _company_id: companyId,
      _action_type: "campaign_published",
      _entity_type: "meta_campaign",
      _entity_id: campaignId,
      _description: `Kampagne offentliggjort: ${campaign_name}`,
      _metadata: {
        campaign_id: campaignId,
        ad_set_id: adSetId,
        ad_id: adData.id,
        scheduled: !!schedule,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        campaign_id: campaignId,
        ad_set_id: adSetId,
        creative_id: creativeId,
        ad_id: adData.id,
        status: status || "ACTIVE",
        scheduled: !!schedule,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("meta-publish-campaign error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg, detail: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
