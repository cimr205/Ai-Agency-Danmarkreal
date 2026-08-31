import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
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

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!profile?.company_id) return new Response(JSON.stringify({ error: "No company associated" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const ai = await getCompanyAI(supabase, profile.company_id);
    if (!ai) return new Response(JSON.stringify({ error: AI_NOT_CONNECTED_MESSAGE }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { type, product, audience, offer, objective, tone, cta, question } = await req.json();

    if (type === "generate") {
      // Ad copy generation with tool calling for structured output
      const systemPrompt = `You are an expert Meta Ads copywriter and performance marketer. Generate high-converting ad copy based on the user's inputs. Be creative, persuasive, and data-driven. Use proven direct response copywriting frameworks.`;

      const userPrompt = `Generate Meta ad copy for:
- Product/Service: ${product || "Not specified"}
- Target Audience: ${audience || "Not specified"}
- Offer: ${offer || "Not specified"}
- Objective: ${objective || "Conversions"}
- Tone: ${tone || "Professional"}
- Desired CTA: ${cta || "Not specified"}

Generate compelling ad copy with multiple variations.`;

      const response = await fetch(ai.url, {
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
          tools: [
            {
              type: "function",
              function: {
                name: "return_ad_copy",
                description: "Return generated ad copy in structured format",
                parameters: {
                  type: "object",
                  properties: {
                    headlines: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-5 compelling headlines under 40 characters each",
                    },
                    primaryTexts: {
                      type: "array",
                      items: { type: "string" },
                      description: "2-3 primary text variations, 125-250 characters each, persuasive and action-oriented",
                    },
                    hooks: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-4 attention-grabbing hook ideas for the first line",
                    },
                    ctas: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-5 call-to-action button text suggestions",
                    },
                    angles: {
                      type: "array",
                      items: { type: "string" },
                      description: "3-4 creative angle ideas describing the approach",
                    },
                  },
                  required: ["headlines", "primaryTexts", "hooks", "ctas", "angles"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_ad_copy" } },
        }),
      });

      if (!response.ok) {
        const { status, message } = await describeOpenAIError(response);
        console.error("AI gateway error:", status, message);
        return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        return new Response(JSON.stringify({ error: "No structured output received" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const adCopy = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(adCopy), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (type === "analyst") {
      // Quick analyst Q&A - non-streaming
      const systemPrompt = `You are a senior Meta Ads analyst. The user has these campaigns running:

Campaign data:
- Summer Sale 2026: Active, Conversions, $3,240 spend, 3.12% CTR, $0.31 CPC, 487 conv, 4.2x ROAS
- Brand Awareness Q1: Active, Awareness, $2,180 spend, 1.84% CTR, $0.42 CPC, 213 conv, 2.8x ROAS
- Product Launch – Pro: Active, Traffic, $4,120 spend, 2.95% CTR, $0.28 CPC, 634 conv, 3.9x ROAS
- Retargeting – Cart: Paused, Conversions, $1,640 spend, 4.21% CTR, $0.22 CPC, 312 conv, 5.1x ROAS
- Newsletter Signup: Active, Lead Gen, $890 spend, 1.42% CTR, $0.58 CPC, 98 conv, 1.4x ROAS
- Holiday Campaign: Completed, $410 spend, 2.10% CTR, $0.39 CPC, 103 conv, 2.3x ROAS

Top ads:
- Video – Social Proof: $1,240 spend, 4.82% CTR, $0.18 CPC, 214 conv (BEST)
- Carousel – Features: $980 spend, 3.21% CTR, $0.26 CPC, 168 conv
- Static – Generic CTA: $1,860 spend, 0.94% CTR, $0.72 CPC, 34 conv (WORST)
- Video – Long Form: $1,340 spend, 1.12% CTR, $0.61 CPC, 48 conv (WORST)

Answer concisely and actionably. Use specific numbers. Keep answers under 150 words.`;

      const response = await fetch(ai.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ai.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ai.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
          ],
        }),
      });

      if (!response.ok) {
        const { status, message } = await describeOpenAIError(response);
        console.error("AI gateway error:", status, message);
        return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || "Unable to generate answer.";
      return new Response(JSON.stringify({ answer }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: "Invalid type. Use 'generate' or 'analyst'." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("meta-ads-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
