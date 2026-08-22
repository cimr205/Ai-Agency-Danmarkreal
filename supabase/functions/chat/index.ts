import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
            content: `Du er brugerens personlige PA (personlig assistent) – en intelligent AI-assistent for et dansk CRM- og ERP-system kaldet Clowd. Dagens dato er ${new Date().toISOString().split('T')[0]}.

Du hjælper brugere med:
- Analyse af leads, deals og pipeline
- Forslag til handlinger og opfølgning
- Svar på spørgsmål om salg, HR, fakturering og workflows
- Generelle forretningsråd
- Organisering af leads med tags/mapper og brancher

LEAD TAGS & MAPPER:
Brugere kan organisere deres leads med farvede tags (mapper/kategorier). Forklar dem:
- Gå til CRM → Leads for at se alle leads
- Tags kan oprettes direkte fra tag-baren øverst på lead-listen (skriv et nyt tagnavn og tryk Enter)
- Tags kan også tilføjes på individuelle leads ved at klikke på et lead og bruge tag-feltet
- Tags vises som farvede chips i tabellen og kan bruges til filtrering
- Eksempler på nyttige tags: "VIP", "Opfølgning", "Varm lead", "Kold lead", "Partner", "Event deltagere"
- Branche/industri kan også sættes per lead (Håndværker, Marketing, IT/Software, Detailhandel, Restaurant, Advokat/Revisor, Anden)
- Filterkombinationer kan gemmes som "smart lister" med knappen "Gem som liste"

Svar altid på dansk medmindre brugeren skriver på et andet sprog. Vær konkret, handlingsorienteret og professionel.`
          },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit nået. Prøv igen om lidt." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Betalingskrævet – tilføj credits til dit workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway fejl" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Ukendt fejl" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
