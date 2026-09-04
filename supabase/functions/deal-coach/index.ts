import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCompanyAI, AI_NOT_CONNECTED_MESSAGE, describeOpenAIError } from "../_shared/aiConnection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Service-role client bypasses RLS, so tenant isolation must be enforced explicitly here.
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!profile?.company_id) return new Response(JSON.stringify({ error: "No company associated" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const ai = await getCompanyAI(supabase, profile.company_id);
    if (!ai) return new Response(JSON.stringify({ error: AI_NOT_CONNECTED_MESSAGE }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { deal_id } = await req.json();
    if (!deal_id) return new Response(JSON.stringify({ error: "deal_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch deal with related data, scoped to the caller's own company
    const { data: deal, error: dealErr } = await supabase
      .from("deals")
      .select("*, customers!deals_customer_id_fkey(name, email)")
      .eq("id", deal_id)
      .eq("company_id", profile.company_id)
      .single();
    if (dealErr || !deal) return new Response(JSON.stringify({ error: "Deal not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch activity logs for this deal
    const { data: activities } = await supabase
      .from("activity_logs")
      .select("action_type, description, created_at")
      .eq("entity_id", deal_id)
      .eq("entity_type", "deal")
      .order("created_at", { ascending: false })
      .limit(15);

    // Fetch company's historical win rate
    const { data: allDeals } = await supabase
      .from("deals")
      .select("stage, value, created_at")
      .eq("company_id", deal.company_id);

    const totalClosed = (allDeals || []).filter(d => d.stage === "won" || d.stage === "lost").length;
    const totalWon = (allDeals || []).filter(d => d.stage === "won").length;
    const winRate = totalClosed > 0 ? Math.round((totalWon / totalClosed) * 100) : 50;

    const daysSinceCreation = Math.floor((Date.now() - new Date(deal.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const lastActivity = activities?.[0]?.created_at ? Math.floor((Date.now() - new Date(activities[0].created_at).getTime()) / (1000 * 60 * 60 * 24)) : null;

    const prompt = `You are an experienced sales coach for a CRM system. Analyze this deal and give concrete, action-oriented advice.

DEAL DATA:
- Title: ${deal.title}
- Value: ${deal.value} DKK
- Stage: ${deal.stage}
- Created: ${deal.created_at} (${daysSinceCreation} days ago)
- Expected close: ${deal.expected_close_date || "Not set"}
- Customer: ${(deal as { customers?: { name?: string } }).customers?.name || "None"}
- Notes: ${deal.notes || "None"}

COMPANY HISTORY:
- Win rate: ${winRate}%
- Total deals closed: ${totalClosed}
- Average deal value: ${allDeals?.length ? Math.round((allDeals.reduce((s, d) => s + Number(d.value || 0), 0)) / allDeals.length) : 0} DKK

RECENT ACTIVITY (${lastActivity !== null ? lastActivity + " days ago" : "None"}):
${(activities || []).slice(0, 5).map(a => `- ${a.description} (${new Date(a.created_at).toLocaleDateString("da-DK")})`).join("\n") || "No activity registered"}

Return a JSON object with these exact keys:
- "win_probability": number 0-100
- "risk_level": "low" | "medium" | "high"
- "summary": string (1-2 sentences assessment)
- "actions": array of exactly 3 concrete action strings
- "insights": array of 2-3 observation strings

IMPORTANT: Return ONLY valid JSON with the keys above. No markdown, no code fences, just raw JSON.`;

    const response = await fetch(ai.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const { status, message } = await describeOpenAIError(response, ai.provider);
      return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    let analysis: { win_probability: number; risk_level: string; summary: string; actions: string[]; insights: string[] };
    try {
      const jsonStr = rawContent.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      analysis = JSON.parse(jsonStr);
    } catch {
      throw new Error("Could not parse AI response as JSON");
    }

    if (typeof analysis.win_probability !== 'number' || !analysis.summary) {
      throw new Error("Invalid analysis format from AI");
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("deal-coach error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
