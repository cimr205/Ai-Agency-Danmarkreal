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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Service-role client bypasses RLS, so tenant isolation must be enforced explicitly here.
    const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!profile?.company_id) return new Response(JSON.stringify({ error: "No company associated" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const ai = await getCompanyAI(supabase, profile.company_id);
    if (!ai) return new Response(JSON.stringify({ error: AI_NOT_CONNECTED_MESSAGE }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { transcript, deal_id, lead_id, meeting_title } = await req.json();
    if (!transcript) return new Response(JSON.stringify({ error: "transcript required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Fetch context, scoped to the caller's own company
    let dealContext = "";
    if (deal_id) {
      const { data: deal } = await supabase.from("deals").select("title, stage, value, notes").eq("id", deal_id).eq("company_id", profile.company_id).single();
      if (deal) dealContext = `\nDEAL KONTEKST: "${deal.title}" - Stage: ${deal.stage}, Værdi: ${deal.value} DKK\nNoter: ${deal.notes || "Ingen"}`;
    }

    let leadContext = "";
    if (lead_id) {
      // E2E-005: `customers` (record_type='lead') is the live table post merge.
      const { data: lead } = await supabase.from("customers").select("name, company_name, status, notes").eq("id", lead_id).eq("company_id", profile.company_id).eq("record_type", "lead").single();
      if (lead) leadContext = `\nLEAD KONTEKST: ${lead.name} (${lead.company_name || "Ukendt"}) - Status: ${lead.status}\nNoter: ${lead.notes || "Ingen"}`;
    }

    const prompt = `Du er en professionel mødeopsamler for et dansk CRM-system. Analysér dette mødereferat/transskription og generer struktureret output.

MØDE: ${meeting_title || "Ukendt møde"}
${dealContext}
${leadContext}

TRANSSKRIPTION/NOTER:
${transcript}

OPGAVE: Analysér mødet og returnér JSON med:
1. "summary": Kort referat (3-5 sætninger, dansk)
2. "key_points": Array af 3-5 vigtigste pointer
3. "action_items": Array af objekter med { "title": string, "assignee": string, "due_days": number } — konkrete follow-up opgaver
4. "deal_update": Objekt med { "suggested_stage": string | null, "suggested_notes": string } — foreslået opdatering til deal
5. "sentiment": "positive" | "neutral" | "negative" — samlet stemning
6. "next_steps": String med anbefalede næste skridt
7. "follow_up_email_draft": Kort opfølgningsmail (dansk, maks 100 ord)

Svar KUN med valid JSON.`;

    const response = await fetch(ai.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: "user", content: prompt }],
        tools: [{
          type: "function",
          function: {
            name: "meeting_analysis",
            description: "Analyze meeting transcript",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string" },
                key_points: { type: "array", items: { type: "string" } },
                action_items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      assignee: { type: "string" },
                      due_days: { type: "number" }
                    },
                    required: ["title", "assignee", "due_days"]
                  }
                },
                deal_update: {
                  type: "object",
                  properties: {
                    suggested_stage: { type: "string" },
                    suggested_notes: { type: "string" }
                  },
                  required: ["suggested_notes"]
                },
                sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
                next_steps: { type: "string" },
                follow_up_email_draft: { type: "string" }
              },
              required: ["summary", "key_points", "action_items", "deal_update", "sentiment", "next_steps", "follow_up_email_draft"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "meeting_analysis" } }
      }),
    });

    if (!response.ok) {
      const { status, message } = await describeOpenAIError(response, ai.provider);
      return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const analysis = JSON.parse(toolCall.function.arguments);

    // Auto-create tasks from action items
    if (profile?.company_id && analysis.action_items?.length) {
      for (const item of analysis.action_items) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + (item.due_days || 3));
        await supabase.from("tasks").insert({
          title: item.title,
          description: `Auto-oprettet fra møde: ${meeting_title || "Ukendt"}\nTildelt: ${item.assignee}`,
          company_id: profile.company_id,
          created_by: user.id,
          deal_id: deal_id || null,
          lead_id: lead_id || null,
          due_date: dueDate.toISOString().split("T")[0],
          priority: "medium",
        });
      }
    }

    // Auto-update deal notes if deal_id provided
    if (deal_id && analysis.deal_update?.suggested_notes) {
      const { data: existingDeal } = await supabase.from("deals").select("notes").eq("id", deal_id).eq("company_id", profile.company_id).single();
      const updatedNotes = `${existingDeal?.notes || ""}\n\n--- Mødereferat ${new Date().toLocaleDateString("da-DK")} ---\n${analysis.summary}`.trim();
      await supabase.from("deals").update({ notes: updatedNotes }).eq("id", deal_id).eq("company_id", profile.company_id);
    }

    return new Response(JSON.stringify({ ...analysis, tasks_created: analysis.action_items?.length || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("meeting-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
