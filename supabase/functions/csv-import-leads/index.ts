import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user from token
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: userError } = await adminClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (userError || !user) throw new Error("Unauthorized");

    // Get user's company
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) throw new Error("No company found");

    const { rows, mapping, useAi } = await req.json() as {
      rows: Record<string, string>[];
      mapping: Record<string, string>; // csv_column -> db_field
      useAi: boolean;
    };

    if (!rows?.length || !mapping) throw new Error("Missing rows or mapping");

    const batchId = crypto.randomUUID();
    const leads: Array<Record<string, unknown>> = [];

    // Industry detection from company name
    const industryKeywords: Record<string, string[]> = {
      craftsman: ['murer', 'tømrer', 'vvs', 'elektriker', 'maler', 'snedker', 'anlæg', 'bygge', 'construction', 'plumber', 'carpenter', 'handwerk', 'håndværk', 'tag', 'gulv'],
      marketing: ['marketing', 'reklame', 'bureau', 'agency', 'media', 'digital', 'seo', 'branding', 'kommunikation', 'pr '],
      it_software: ['it', 'software', 'tech', 'web', 'app', 'cloud', 'data', 'cyber', 'hosting', 'saas', 'development', 'consulting'],
      retail: ['detail', 'butik', 'shop', 'retail', 'handel', 'salg', 'store', 'kiosk', 'supermarked'],
      restaurant: ['restaurant', 'café', 'cafe', 'catering', 'food', 'mad', 'pizza', 'sushi', 'bar', 'bistro', 'kantine'],
      legal_accounting: ['advokat', 'revisor', 'juridisk', 'law', 'legal', 'accounting', 'regnskab', 'bogholderi', 'attorney', 'counsel'],
    };

    function detectIndustry(companyName?: string, notes?: string): string | null {
      if (!companyName && !notes) return null;
      const text = ((companyName || '') + ' ' + (notes || '')).toLowerCase();
      for (const [industry, keywords] of Object.entries(industryKeywords)) {
        if (keywords.some(kw => text.includes(kw))) return industry;
      }
      return null;
    }

    for (const row of rows) {
      const lead: Record<string, unknown> = {
        company_id: profile.company_id,
        created_by: user.id,
        import_batch_id: batchId,
        status: "new",
      };

      for (const [csvCol, dbField] of Object.entries(mapping)) {
        if (!dbField || !row[csvCol]) continue;
        const val = row[csvCol].trim();
        if (dbField === "value") {
          lead[dbField] = parseFloat(val.replace(/[^0-9.,\-]/g, "").replace(",", ".")) || 0;
        } else if (dbField === "score") {
          lead[dbField] = parseInt(val, 10) || 0;
        } else if (dbField === "tags") {
          lead[dbField] = val.split(/[,;|]/).map((t: string) => t.trim()).filter(Boolean);
        } else {
          lead[dbField] = val;
        }
      }

      // Auto-detect industry if not explicitly mapped
      if (!lead.industry) {
        lead.industry = detectIndustry(lead.company_name as string, lead.notes as string);
      }

      if (!lead.name || !lead.email) continue;
      leads.push(lead);
    }

    if (!leads.length) {
      return new Response(JSON.stringify({ error: "No valid leads found (name + email required)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for duplicates by email within company
    const emails = leads.map(l => l.email as string);
    const { data: existing } = await adminClient
      .from("leads")
      .select("email")
      .eq("company_id", profile.company_id)
      .in("email", emails);

    const existingEmails = new Set((existing || []).map(e => e.email.toLowerCase()));
    const newLeads = leads.filter(l => !existingEmails.has((l.email as string).toLowerCase()));
    const duplicateCount = leads.length - newLeads.length;

    if (!newLeads.length) {
      return new Response(JSON.stringify({
        imported: 0, duplicates: duplicateCount, total: leads.length, batch_id: batchId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // AI pipeline assignment
    if (useAi) {
      const apiKey = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
      if (apiKey) {
        try {
          const leadsForAi = newLeads.slice(0, 50).map(l => ({
            name: l.name, email: l.email, company_name: l.company_name, value: l.value, notes: l.notes,
          }));

          const aiRes = await fetch((Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions"), {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                {
                  role: "system",
                  content: `You classify sales leads. For each lead, return a JSON array with objects: { "email": string, "status": "new"|"contacted"|"qualified"|"unqualified", "score": 0-5 }. Base classification on company name, value, and notes. High-value leads with company names → qualified, score 4-5. Unknown/personal emails → new, score 1-2. Reply ONLY with the JSON array.`,
                },
                { role: "user", content: JSON.stringify(leadsForAi) },
              ],
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const content = aiData.choices?.[0]?.message?.content || "";
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const classifications = JSON.parse(jsonMatch[0]) as Array<{ email: string; status: string; score: number }>;
              const classMap = new Map(classifications.map(c => [c.email.toLowerCase(), c]));
              for (const lead of newLeads) {
                const c = classMap.get((lead.email as string).toLowerCase());
                if (c) {
                  if (["new", "contacted", "qualified", "unqualified"].includes(c.status)) lead.status = c.status;
                  if (c.score >= 0 && c.score <= 5) lead.score = c.score;
                }
              }
            }
          }
        } catch (e) {
          console.error("AI classification error (continuing without):", e);
        }
      }
    }

    // Insert in batches of 50
    let imported = 0;
    for (let i = 0; i < newLeads.length; i += 50) {
      const batch = newLeads.slice(i, i + 50);
      const { error: insertError, data: inserted } = await adminClient
        .from("leads")
        .insert(batch)
        .select("id");

      if (insertError) {
        console.error("Insert error:", insertError);
        continue;
      }
      imported += inserted?.length || 0;
    }

    return new Response(JSON.stringify({
      imported,
      duplicates: duplicateCount,
      total: leads.length,
      batch_id: batchId,
      ai_classified: useAi,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("csv-import error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
