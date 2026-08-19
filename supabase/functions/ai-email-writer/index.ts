import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Service-role client bypasses RLS, so tenant isolation must be enforced explicitly here.
    const { data: callerProfile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!callerProfile?.company_id) return new Response(JSON.stringify({ error: "No company associated" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { lead_id, tone, purpose, custom_context } = await req.json();
    if (!lead_id) return new Response(JSON.stringify({ error: "lead_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch lead data, scoped to the caller's own company
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .eq("company_id", callerProfile.company_id)
      .single();
    if (leadErr || !lead) return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch sender profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .single();

    // Fetch company info
    const { data: company } = await supabase
      .from("companies")
      .select("name, industry, website")
      .eq("id", lead.company_id)
      .single();

    // Fetch previous emails to this lead
    const { data: prevEmails } = await supabase
      .from("emails")
      .select("subject, snippet, from_address")
      .eq("company_id", lead.company_id)
      .ilike("to_addresses", `%${lead.email}%`)
      .order("received_at", { ascending: false })
      .limit(3);

    const emailTone = tone || "professional";
    const emailPurpose = purpose || "cold_outreach";

    const prompt = `Du er en elite B2B-salgskommunikationsekspert for danske virksomheder. Skriv en personaliseret email.

AFSENDER:
- Navn: ${profile?.full_name || "Sælger"}
- Email: ${profile?.email || ""}
- Virksomhed: ${company?.name || "Vores virksomhed"}
- Branche: ${company?.industry || "Ikke angivet"}
- Website: ${company?.website || ""}

MODTAGER (LEAD):
- Navn: ${lead.name}
- Email: ${lead.email}
- Virksomhed: ${lead.company_name || "Ukendt"}
- Telefon: ${lead.phone || "Ingen"}
- Status: ${lead.status}
- Score: ${lead.score || "Ikke scored"}
- Noter: ${lead.notes || "Ingen"}
- AI Anbefaling: ${lead.ai_recommendation || "Ingen"}

TIDLIGERE KOMMUNIKATION:
${prevEmails?.length ? prevEmails.map(e => `- "${e.subject}" fra ${e.from_address}: ${e.snippet}`).join("\n") : "Ingen tidligere emails"}

${custom_context ? `EKSTRA KONTEKST FRA BRUGER:\n${custom_context}` : ""}

INSTRUKTIONER:
- Formål: ${emailPurpose === "cold_outreach" ? "Kold outreach — første kontakt" : emailPurpose === "follow_up" ? "Opfølgning" : emailPurpose === "meeting_request" ? "Mødebooking" : emailPurpose === "proposal" ? "Tilbudspræsentation" : emailPurpose}
- Tone: ${emailTone === "professional" ? "Professionel og direkte" : emailTone === "casual" ? "Afslappet og personlig" : emailTone === "urgent" ? "Presserende med deadline" : emailTone}
- Skriv på dansk
- Emailen skal føles som om afsenderen har brugt 30 minutter på research
- Referencér specifikke ting om modtagerens virksomhed/branche
- Maks 150 ord i body
- Inkludér en klar CTA

Returnér JSON med "subject" og "body" felter.`;

    const response = await fetch((Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt + "\n\nIMPORTANT: Return ONLY valid JSON with keys \"subject\" and \"body\". No markdown, no code fences, just raw JSON." }],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit — prøv igen om lidt" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Credits opbrugt" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errBody = await response.text();
      console.error("AI gateway error:", response.status, errBody);
      throw new Error("AI gateway error: " + response.status);
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response, handling possible markdown code fences
    let email: { subject: string; body: string };
    try {
      const jsonStr = rawContent.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      email = JSON.parse(jsonStr);
    } catch {
      // Try to extract from tool call as fallback
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        email = JSON.parse(toolCall.function.arguments);
      } else {
        throw new Error("Could not parse AI response as JSON");
      }
    }

    if (!email.subject || !email.body) throw new Error("Missing subject or body in AI response");

    return new Response(JSON.stringify(email), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-email-writer error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
