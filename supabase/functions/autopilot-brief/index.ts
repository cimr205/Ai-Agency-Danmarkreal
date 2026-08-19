import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the Business Autopilot — an AI Chief of Staff for small and medium businesses. You have full visibility into a company's CRM, HR, Marketing, and Finance data. Your job is to surface the most important actions the CEO or business owner should take TODAY.

YOUR PERSONALITY:
- Direct, confident, warm. Like a brilliant EA who has already done the thinking.
- Never use filler phrases like "Great question" or "It looks like..."
- Never hedge — say what should happen.
- Write in the language of the user's company locale.
- Maximum 2 sentences per action. Be ruthless with brevity.

RULES:
1. Maximum 7 actions per brief. Fewer is better.
2. Never recommend an action that was approved AND executed in last 3 days for same entity.
3. Never recommend an action the user skipped in last 7 days unless situation changed materially.
4. Rank FINANCE issues first if money is at risk.
5. For stalled deals: only surface if value is above average OR stalled >10 days.
6. For HR: only surface overtime/absence for customer-facing or revenue-generating roles.
7. Greeting must reference something specific — a win, a risk, or a notable data point.
8. business_health_score must reflect genuine data signals.
9. Write every action as a briefing, not suggestions.
10. If nothing urgent, say so honestly and surface only 2-3 maintenance actions.

Return ONLY valid JSON with this structure:
{
  "greeting": "string",
  "business_health_score": { "score": number, "trend": "up"|"down"|"flat", "reason": "string" },
  "actions": [{ "id": "string", "priority": number, "category": "CRM"|"HR"|"Finance"|"Marketing", "urgency": "critical"|"high"|"normal", "headline": "string (6 words max)", "context": "string", "recommended_action": "string (start with verb)", "approve_label": "string (3 words max)", "skip_label": "Skip Today", "execution_function": "string", "execution_payload": {} }],
  "one_thing": "string",
  "wins_today": ["string"],
  "tomorrow_preview": "string"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    // Get company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, full_name")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) throw new Error("No company");

    const companyId = profile.company_id;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Gather data in parallel
    const [
      leadsRes, dealsRes, invoicesRes, paymentsRes, employeesRes,
      attendanceRes, recentActionsRes, companyRes
    ] = await Promise.all([
      // New leads 24h
      supabase.from("leads").select("id, name, email, score, company_name, status, created_at")
        .eq("company_id", companyId).gte("created_at", twentyFourHoursAgo).order("created_at", { ascending: false }).limit(20),
      // All open deals
      supabase.from("deals").select("id, title, value, stage, customer_id, expected_close_date, updated_at, notes, customers(name)")
        .eq("company_id", companyId).not("stage", "in", "(won,lost)").order("value", { ascending: false }).limit(50),
      // Invoices
      supabase.from("invoices").select("id, invoice_number, amount, status, due_date, customers(name)")
        .eq("company_id", companyId).in("status", ["sent", "overdue"]).order("due_date", { ascending: true }).limit(30),
      // Recent payments (24h)
      supabase.from("payments").select("id, amount, paid_at, customers(name)")
        .eq("company_id", companyId).gte("paid_at", twentyFourHoursAgo).limit(10),
      // Employees
      supabase.from("employee_profiles").select("id, full_name, position, department, start_date, is_active")
        .eq("company_id", companyId).eq("is_active", true).limit(100),
      // Today's attendance
      supabase.from("attendance_logs").select("id, employee_profile_id, check_in, check_out")
        .eq("company_id", companyId).gte("check_in", now.toISOString().split("T")[0]).limit(100),
      // Recent autopilot actions (to avoid repeats)
      supabase.from("autopilot_actions").select("action_type, entity_id, status, created_at")
        .eq("company_id", companyId).gte("created_at", sevenDaysAgo).limit(50),
      // Company info
      supabase.from("companies").select("name").eq("id", companyId).single(),
    ]);

    // Process deals
    const deals = dealsRes.data || [];
    const avgDealValue = deals.length > 0 ? deals.reduce((s, d) => s + Number(d.value || 0), 0) / deals.length : 0;

    const stalledDeals = deals.filter(d => {
      const daysSinceUpdate = (now.getTime() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 7;
    }).map(d => ({
      ...d,
      days_stalled: Math.floor((now.getTime() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
      customer_name: (d as { customers?: { name?: string } }).customers?.name || "Unknown",
    }));

    const dealsClosingSoon = deals.filter(d => d.expected_close_date && d.expected_close_date <= sevenDaysFromNow);

    // Process invoices
    const invoices = invoicesRes.data || [];
    const overdueInvoices = invoices.filter(i => i.due_date && new Date(i.due_date) < now).map(i => ({
      ...i,
      days_overdue: Math.floor((now.getTime() - new Date(i.due_date!).getTime()) / (1000 * 60 * 60 * 24)),
      customer_name: (i as { customers?: { name?: string } }).customers?.name || "Unknown",
    }));
    const invoicesDueSoon = invoices.filter(i => i.due_date && new Date(i.due_date) >= now && i.due_date <= fiveDaysFromNow);
    const unpaidTotal = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);

    // Process payments
    const recentPayments = (paymentsRes.data || []).map(p => ({
      amount: p.amount,
      customer_name: (p as { customers?: { name?: string } }).customers?.name || "Unknown",
    }));

    // High ICP uncontacted leads
    const leads = leadsRes.data || [];
    const highIcpUncontacted = leads.filter(l => (l.score || 0) >= 70 && l.status === "new");

    // Build business data payload for AI
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const businessData = {
      company_name: companyRes.data?.name || "Company",
      owner_name: profile.full_name?.split(" ")[0] || "CEO",
      day_of_week: days[now.getDay()],
      locale: "da-DK",
      previous_actions_approved: (recentActionsRes.data || []).filter(a => a.status === "approved").map(a => ({ type: a.action_type, entity_id: a.entity_id })),
      previous_actions_skipped: (recentActionsRes.data || []).filter(a => a.status === "skipped").map(a => ({ type: a.action_type, entity_id: a.entity_id })),
      crm: {
        new_leads_24h: leads.map(l => ({ name: l.name, icp_score: l.score, company: l.company_name, email: l.email })),
        stalled_deals: stalledDeals.slice(0, 10),
        high_icp_uncontacted: highIcpUncontacted,
        deals_closing_soon: dealsClosingSoon,
      },
      hr: {
        absent_today: (() => {
          const employees = employeesRes.data || [];
          const checkedInIds = new Set((attendanceRes.data || []).map(a => a.employee_profile_id));
          return employees.filter(e => !checkedInIds.has(e.id)).slice(0, 10).map(e => ({ name: e.full_name, position: e.position }));
        })(),
        new_hires: (employeesRes.data || []).filter(e => {
          const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
          return e.start_date && new Date(e.start_date) > fourteenDaysAgo;
        }),
        total_employees: (employeesRes.data || []).length,
      },
      finance: {
        overdue_invoices: overdueInvoices,
        invoices_due_soon: invoicesDueSoon.map(i => ({ ...i, customer_name: (i as { customers?: { name?: string } }).customers?.name })),
        unpaid_total: unpaidTotal,
        recent_payments: recentPayments,
      },
    };

    // Call AI
    const aiUrl = (Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions");
    const aiKey = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY")) || "";

    const aiResp = await fetch(aiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
      body: JSON.stringify({
        model: "llama3.2:3b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Here is the real-time business data for today:\n\n${JSON.stringify(businessData, null, 2)}` },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI error:", errText);
      throw new Error(`AI error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";

    // Parse and validate
    let briefing;
    try {
      briefing = JSON.parse(content);
    } catch {
      // Try to extract JSON from markdown
      const jsonMatch = content.match(/```json?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
      briefing = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : "{}");
    }

    return new Response(JSON.stringify(briefing), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Autopilot brief error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
