import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCompanyAI, AI_NOT_CONNECTED_MESSAGE } from "../_shared/aiConnection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await client.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: profile } = await client.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!profile?.company_id) throw new Error("No company associated");

    const { leadName, companyName, industry, phone, email, notes, scriptType } = await req.json();

    const ai = await getCompanyAI(client, profile.company_id);
    if (!ai) throw new Error(AI_NOT_CONNECTED_MESSAGE);

    const systemPrompt = `Du er en erfaren salgskonsulent der skriver korte, effektive telefonmanuskripter på dansk.
Regler:
- Skriv et kort, naturligt manuskript (maks 150 ord)
- Brug leadets navn og firmanavn naturligt
- Tilpas tonen til branchen
- Inkluder en stærk åbning, et værdifuldt spørgsmål, og en klar CTA
- Brug [dit navn] og [dit firma] som placeholders for sælgerens info
- Formatér med korte afsnit og bindestreger for key points
- Skriv KUN manuskriptet, ingen forklaringer`;

    const userPrompt = `Generér et ${scriptType || "intro"} telefonmanuskript for dette lead:
- Navn: ${leadName || "Ukendt"}
- Firma: ${companyName || "Ukendt"}
- Branche: ${industry || "Ukendt"}
${notes ? `- Noter: ${notes}` : ""}
${email ? `- Email: ${email}` : ""}`;

    const aiResp = await fetch(ai.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ai.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit – prøv igen om lidt" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditter opbrugt" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI error");
    }

    const result = await aiResp.json();
    const script = result.choices?.[0]?.message?.content || "Kunne ikke generere manuskript.";

    return new Response(JSON.stringify({ script }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
