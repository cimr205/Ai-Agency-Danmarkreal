import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: corsHeaders });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) return new Response(JSON.stringify({ error: "No company" }), { status: 400, headers: corsHeaders });

    const { icp_profile_id } = await req.json();
    if (!icp_profile_id) return new Response(JSON.stringify({ error: "icp_profile_id required" }), { status: 400, headers: corsHeaders });

    // Load ICP profile
    const { data: icp, error: icpErr } = await supabase
      .from("icp_profiles")
      .select("*")
      .eq("id", icp_profile_id)
      .eq("company_id", profile.company_id)
      .single();
    if (icpErr || !icp) return new Response(JSON.stringify({ error: "ICP not found" }), { status: 404, headers: corsHeaders });

    // Load leads. E2E-005: `customers` (record_type='lead') is the live
    // table post lead/customer merge — the old `leads` table is stale.
    const { data: leads, error: leadsErr } = await supabase
      .from("customers")
      .select("*")
      .eq("company_id", profile.company_id)
      .eq("record_type", "lead")
      .limit(1000);
    if (leadsErr) throw leadsErr;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ scored_count: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Score each lead
    const scores = leads.map((lead: Lead) => scoreLead(lead, icp as IcpProfile, profile.company_id));

    // Upsert scores
    const { error: upsertErr } = await supabase
      .from("lead_icp_scores")
      .upsert(scores, { onConflict: "lead_id,icp_profile_id" });
    if (upsertErr) throw upsertErr;

    return new Response(
      JSON.stringify({ scored_count: scores.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("icp-score error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});

// ─── Scoring Engine ─────────────────────────────────────────
interface Lead {
  id: string;
  industry?: string | null;
  company_name?: string | null;
  notes?: string | null;
  phone?: string | null;
  email?: string | null;
  value?: number | null;
}

interface IcpProfile {
  id: string;
  industry?: string[] | null;
  target_countries?: string[] | null;
  target_cities?: string[] | null;
  target_regions?: string[] | null;
  min_employees?: number | null;
  max_employees?: number | null;
  target_roles?: string[] | null;
  pain_points?: string[] | null;
  desired_services?: string[] | null;
  budget_level?: string | null;
  weight_industry: number;
  weight_location: number;
  weight_company_size: number;
  weight_role_fit: number;
  weight_pain_points: number;
  weight_service_fit: number;
  weight_budget_fit: number;
}

function scoreLead(lead: Lead, icp: IcpProfile, companyId: string) {
  const matchReasons: string[] = [];
  const redFlags: string[] = [];

  // Weights (1=low, 2=med, 3=high) → multiplier
  const wMul = (w: number) => w === 3 ? 1.5 : w === 2 ? 1.0 : 0.6;

  // A. Industry Score (max 25)
  let industryScore = 0;
  const leadIndustry = (lead.industry || "").toLowerCase();
  const icpIndustries = (icp.industry || []).map((s: string) => s.toLowerCase());
  if (leadIndustry && icpIndustries.includes(leadIndustry)) {
    industryScore = 25;
    matchReasons.push(`Matches target industry: ${lead.industry}`);
  } else if (leadIndustry && icpIndustries.some((i: string) => leadIndustry.includes(i) || i.includes(leadIndustry))) {
    industryScore = 15;
    matchReasons.push(`Related industry: ${lead.industry}`);
  } else if (icpIndustries.length > 0 && leadIndustry) {
    redFlags.push(`Industry "${lead.industry}" not in target list`);
  }

  // B. Location Score (max 15)
  let locationScore = 0;
  const leadCompanyName = (lead.company_name || "").toLowerCase();
  // We don't have city/country on leads directly, use company_name as proxy
  const targetCountries = (icp.target_countries || []).map((s: string) => s.toLowerCase());
  const targetCities = (icp.target_cities || []).map((s: string) => s.toLowerCase());
  const targetRegions = (icp.target_regions || []).map((s: string) => s.toLowerCase());
  // Simple heuristic — if lead has notes or name containing location info
  const allLocText = [lead.notes || "", lead.company_name || ""].join(" ").toLowerCase();
  if (targetCities.some((c: string) => allLocText.includes(c))) {
    locationScore = 15;
    matchReasons.push("Located in target city");
  } else if (targetRegions.some((r: string) => allLocText.includes(r))) {
    locationScore = 10;
    matchReasons.push("Located in target region");
  } else if (targetCountries.length === 0) {
    locationScore = 8; // No location filter = partial score
  }

  // C. Company Size Score (max 15)
  let companySizeScore = 0;
  // We don't have employee count on leads, give partial score or check notes
  if (icp.min_employees === null && icp.max_employees === null) {
    companySizeScore = 10; // No filter = decent score
  } else {
    companySizeScore = 5; // Unknown size = low
    redFlags.push("Company size unknown — needs enrichment");
  }

  // D. Role Score (max 10)
  let roleScore = 0;
  const targetRoles = (icp.target_roles || []).map((r: string) => r.toLowerCase());
  if (targetRoles.length === 0) {
    roleScore = 5;
  } else {
    const notesLower = (lead.notes || "").toLowerCase();
    if (targetRoles.some((r: string) => notesLower.includes(r))) {
      roleScore = 10;
      matchReasons.push("Decision maker role detected");
    } else {
      roleScore = 3;
      redFlags.push("No visible decision-maker role");
    }
  }

  // E. Pain Point Score (max 15)
  let painPointScore = 0;
  const icpPainPoints = (icp.pain_points || []).map((p: string) => p.toLowerCase());
  if (icpPainPoints.length > 0) {
    const signals = [lead.notes || "", lead.company_name || ""].join(" ").toLowerCase();
    const matched = icpPainPoints.filter((p: string) => signals.includes(p.replace(/\s+/g, " ").trim()));
    if (matched.length > 0) {
      painPointScore = Math.min(15, matched.length * 5);
      matchReasons.push(`Shows pain point signals: ${matched.join(", ")}`);
    } else {
      painPointScore = 3; // Unknown
    }
  } else {
    painPointScore = 8; // No criteria = partial
  }

  // F. Service Fit Score (max 10)
  let serviceFitScore = 0;
  const desiredServices = (icp.desired_services || []).map((s: string) => s.toLowerCase());
  if (desiredServices.length === 0) {
    serviceFitScore = 5;
  } else {
    // Heuristic: if pain points match, services likely fit
    serviceFitScore = painPointScore > 5 ? 8 : 3;
    if (serviceFitScore >= 8) matchReasons.push("High potential fit for your services");
  }

  // G. Budget Fit Score (max 10)
  let budgetFitScore = 0;
  const budgetLevel = icp.budget_level || "medium";
  // Estimate from lead value
  if (lead.value && lead.value > 0) {
    if (budgetLevel === "low" || lead.value >= 1000) {
      budgetFitScore = 10;
      matchReasons.push("Budget fit looks strong");
    } else {
      budgetFitScore = 5;
    }
  } else {
    budgetFitScore = 4; // Unknown
  }

  // Weighted total (normalize to 0-100)
  const rawMax = 25 + 15 + 15 + 10 + 15 + 10 + 10; // 100
  const rawScore = industryScore + locationScore + companySizeScore + roleScore + painPointScore + serviceFitScore + budgetFitScore;

  // Apply weights
  const weightedScore = Math.round(
    (industryScore * wMul(icp.weight_industry) +
    locationScore * wMul(icp.weight_location) +
    companySizeScore * wMul(icp.weight_company_size) +
    roleScore * wMul(icp.weight_role_fit) +
    painPointScore * wMul(icp.weight_pain_points) +
    serviceFitScore * wMul(icp.weight_service_fit) +
    budgetFitScore * wMul(icp.weight_budget_fit)) /
    (25 * wMul(icp.weight_industry) + 15 * wMul(icp.weight_location) + 15 * wMul(icp.weight_company_size) +
    10 * wMul(icp.weight_role_fit) + 15 * wMul(icp.weight_pain_points) + 10 * wMul(icp.weight_service_fit) +
    10 * wMul(icp.weight_budget_fit)) * 100
  );

  const totalScore = Math.max(0, Math.min(100, weightedScore));

  // Confidence based on data availability
  let confidence = 50;
  if (lead.industry) confidence += 15;
  if (lead.company_name) confidence += 10;
  if (lead.phone || lead.email) confidence += 10;
  if (lead.value) confidence += 10;
  if (lead.notes) confidence += 5;
  confidence = Math.min(100, confidence);

  // Recommended action
  let recommendedAction = "Skip lead";
  if (totalScore >= 80) recommendedAction = "Send first outreach — hot lead";
  else if (totalScore >= 60) recommendedAction = "Prioritize for manual review";
  else if (totalScore >= 40) recommendedAction = "Enrich more data first";

  return {
    company_id: companyId,
    lead_id: lead.id,
    icp_profile_id: icp.id,
    total_score: totalScore,
    industry_score: industryScore,
    location_score: locationScore,
    company_size_score: companySizeScore,
    role_score: roleScore,
    pain_point_score: painPointScore,
    service_fit_score: serviceFitScore,
    budget_fit_score: budgetFitScore,
    tech_fit_score: 0,
    confidence_score: confidence,
    match_reasons: matchReasons,
    red_flags: redFlags,
    recommended_action: recommendedAction,
    scored_at: new Date().toISOString(),
  };
}
