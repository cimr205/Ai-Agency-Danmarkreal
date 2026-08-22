import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const body = await req.json();
    const { company_name, company_number, address, type, status, country } = body;

    const countryNames: Record<string, string> = { DK: "Danmark", NO: "Norge", UK: "Storbritannien" };

    const response = await fetch((Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3.2:3b",
        messages: [
          {
            role: "system",
            content: `Du er en B2B lead-scoring AI for et dansk CRM-system. Du vurderer virksomheder fra offentlige registre som potentielle salgslead.

Svar ALTID i dette JSON-format (intet andet):
{"score": <tal 1-10>, "summary": "<max 2 sætninger på dansk>"}

Vurder baseret på:
- Virksomhedstype (ApS/AS/Ltd scorer højere end enkeltmandsvirksomheder)
- Aktiv status scorer højere
- Adresselokation (større byer scorer lidt højere)
- Branchepotentiale baseret på virksomhedsnavn
- Land og marked

Score-guide: 1-3 = lav kvalitet, 4-6 = middel, 7-10 = høj kvalitet lead`,
          },
          {
            role: "user",
            content: `Vurder denne virksomhed som potentielt B2B lead:
Navn: ${company_name}
Registreringsnr: ${company_number}
Adresse: ${address}
Type: ${type}
Status: ${status}
Land: ${countryNames[country] || country}`,
          },
        ],
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit, prøv igen om lidt" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return new Response(JSON.stringify({ score: parsed.score || 5, summary: parsed.summary || "Ingen vurdering" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ score: 5, summary: content.slice(0, 150) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("registry-ai-analyze error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
