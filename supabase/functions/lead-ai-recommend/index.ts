import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { lead_id } = await req.json();
    if (!lead_id) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client bypasses RLS, so tenant isolation must be enforced explicitly here.
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company associated" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch the lead, scoped to the caller's own company
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .eq("company_id", profile.company_id)
      .single();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch full relationship/conversation history — the actual context most CRMs lose
    const { data: activities } = await supabase
      .from("activity_logs")
      .select("action_type, description, created_at")
      .eq("entity_id", lead_id)
      .eq("entity_type", "lead")
      .order("created_at", { ascending: false })
      .limit(20);

    // Deals tied to this lead by name (deals aren't FK'd to leads directly in this schema)
    const { data: relatedDeals } = await supabase
      .from("deals")
      .select("title, stage, value, notes, created_at")
      .eq("company_id", lead.company_id)
      .ilike("notes", `%${lead.name}%`)
      .limit(5);

    const daysSinceTouch = lead.last_touched_at
      ? Math.floor((Date.now() - new Date(lead.last_touched_at).getTime()) / (1000 * 60 * 60 * 24))
      : Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24));

    const prompt = `Du er en erfaren salgsassistent for et dansk CRM-system. Din opgave er at give sælgeren den relationskontekst, de ellers ville skulle grave frem manuelt: hvad er der sket, hvad blev der lovet, og hvorfor risikerer denne lead at gå i stå.

LEAD:
- Navn: ${lead.name}
- Virksomhed: ${lead.company_name || "Ukendt"}
- Status: ${lead.status}
- Score: ${lead.score ?? "Ikke sat"}
- Estimeret værdi: ${lead.value ? `${lead.value} DKK` : "Ikke sat"}
- Branche: ${lead.industry || "Ukendt"}
- Oprettet: ${lead.created_at} (sidst kontaktet for ${daysSinceTouch} dage siden)
- Frit-tekst noter: ${lead.notes || "Ingen"}

RELATEREDE DEALS:
${(relatedDeals || []).map(d => `- ${d.title} (${d.stage}, ${d.value} DKK): ${d.notes || "ingen noter"}`).join("\n") || "Ingen relaterede deals"}

AKTIVITETSHISTORIK (nyeste først):
${(activities || []).map(a => `- [${new Date(a.created_at).toLocaleDateString("da-DK")}] ${a.description || a.action_type}`).join("\n") || "Ingen registreret aktivitet"}

Returner et JSON-objekt med præcis disse nøgler:
- "summary": string (2-3 sætninger — hvad er status, og hvorfor)
- "last_contact_summary": string (1 sætning om seneste kontakt, eller "Ingen kontakt registreret endnu" hvis der ingen historik er)
- "open_promises": array af strings — ting der blev lovet men ikke er fulgt op på (tom array hvis ingen)
- "risk_level": "low" | "medium" | "high" — risiko for at deal/lead går i stå
- "risk_reason": string (1 sætning — hvorfor denne risikovurdering)
- "next_action": string (1 konkret, handlingsorienteret næste skridt)

VIGTIGT: Returner KUN gyldig JSON med nøglerne ovenfor. Ingen markdown, ingen kodeblokke, kun rå JSON.`;

    const response = await fetch((Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit nået, prøv igen om lidt." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits opbrugt." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errBody = await response.text();
      console.error("AI gateway error:", response.status, errBody);
      throw new Error("AI gateway error: " + response.status);
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    let summary: {
      summary: string;
      last_contact_summary: string;
      open_promises: string[];
      risk_level: "low" | "medium" | "high";
      risk_reason: string;
      next_action: string;
    };
    try {
      const jsonStr = rawContent.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
      summary = JSON.parse(jsonStr);
    } catch {
      throw new Error("Could not parse AI response as JSON");
    }

    if (!summary.summary || !summary.risk_level) {
      throw new Error("Invalid summary format from AI");
    }

    return new Response(JSON.stringify({ ...summary, days_since_contact: daysSinceTouch }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("lead-ai-recommend error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
