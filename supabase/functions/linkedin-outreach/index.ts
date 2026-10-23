import { withSentry } from "../_shared/sentry.ts";
import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getCompanyAI, AI_NOT_CONNECTED_MESSAGE, describeOpenAIError } from "../_shared/aiConnection.ts";

// LinkedIn outreach (semi-automatic). Composio's LinkedIn toolkit has no
// connection-request or messaging tools, so this function only:
//  - queues leads that have a LinkedIn profile URL,
//  - drafts a Danish connection note (<=300 chars) + follow-up with the
//    company AI, and
//  - reports which LinkedIn account is connected through Composio.
// A human sends the actual request/message from LinkedIn.

const COMPOSIO_API = "https://backend.composio.dev/api/v3";
const MAX_BATCH = 25;
const NOTE_MAX = 300;

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normalizeProfileUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([a-zA-Z0-9_%-]+)/i);
  return m ? `https://www.linkedin.com/in/${m[1].toLowerCase()}` : null;
}

function parseJson(raw: string): { connection_note?: string; followup_message?: string } {
  const clean = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean);
}

function clampNote(note: string): string {
  const t = note.trim();
  if (t.length <= NOTE_MAX) return t;
  return t.slice(0, NOTE_MAX - 1).replace(/\s+\S*$/, "") + "…";
}

Deno.serve(withSentry("linkedin-outreach", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await requireCompanyAuth(req);
  if (ctx instanceof Response) return ctx;
  const { supabase, user, companyId } = ctx;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body */ }
  const action = body.action as string | undefined;

  try {
    // Which LinkedIn account is connected via Composio (read-only check).
    if (action === "account") {
      const { data: row } = await supabase
        .from("integrations")
        .select("id, status, composio_connection_id")
        .eq("company_id", companyId)
        .eq("provider", "linkedin")
        .maybeSingle();
      if (!row || row.status !== "connected" || !row.composio_connection_id) {
        return jsonResponse({ connected: false });
      }
      const apiKey = Deno.env.get("COMPOSIO_API_KEY");
      if (!apiKey) throw new Error("COMPOSIO_API_KEY is not configured");
      const res = await fetch(`${COMPOSIO_API}/tools/execute/LINKEDIN_GET_MY_INFO`, {
        method: "POST",
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: companyId, connected_account_id: row.composio_connection_id, arguments: {} }),
      });
      const parsed = await res.json().catch(() => null) as { data?: Record<string, unknown>; successful?: boolean } | null;
      const d = (parsed?.data?.response_dict ?? parsed?.data ?? {}) as Record<string, unknown>;
      const name = [d.localizedFirstName ?? d.given_name, d.localizedLastName ?? d.family_name].filter(Boolean).join(" ")
        || (d.name as string | undefined) || null;
      return jsonResponse({ connected: res.ok, name });
    }

    // Queue lead_gen_results that have a LinkedIn profile URL.
    if (action === "queue-from-results") {
      const ids = Array.isArray(body.resultIds) ? (body.resultIds as string[]).slice(0, 200) : [];
      if (!ids.length) throw new Error("Vælg mindst ét lead");

      const { data: results, error } = await supabase
        .from("lead_gen_results")
        .select("id, company_name, contact_person_name, contact_role, linkedin_url, imported_lead_id")
        .eq("company_id", companyId)
        .in("id", ids);
      if (error) throw new Error(error.message);

      const seen = new Set<string>();
      const rows = [];
      let noProfile = 0;
      for (const r of results ?? []) {
        const url = normalizeProfileUrl(r.linkedin_url);
        if (!url) { noProfile++; continue; }
        if (seen.has(url)) continue;
        seen.add(url);
        rows.push({
          company_id: companyId,
          lead_gen_result_id: r.id,
          customer_id: r.imported_lead_id ?? null,
          contact_name: r.contact_person_name,
          contact_role: r.contact_role,
          company_name: r.company_name,
          linkedin_url: url,
          created_by: user.id,
        });
      }

      let queued = 0;
      if (rows.length) {
        const { data: existing } = await supabase
          .from("linkedin_outreach").select("linkedin_url").eq("company_id", companyId)
          .in("linkedin_url", rows.map((r) => r.linkedin_url));
        const have = new Set((existing ?? []).map((e: { linkedin_url: string }) => e.linkedin_url));
        const fresh = rows.filter((r) => !have.has(r.linkedin_url));
        if (fresh.length) {
          const { error: insErr } = await supabase.from("linkedin_outreach").insert(fresh);
          if (insErr) throw new Error(insErr.message);
        }
        queued = fresh.length;
        return jsonResponse({ queued, alreadyQueued: rows.length - fresh.length, noProfile });
      }
      return jsonResponse({ queued, alreadyQueued: 0, noProfile });
    }

    // Draft connection note + follow-up for queued rows.
    if (action === "generate-drafts") {
      const ids = Array.isArray(body.ids) ? (body.ids as string[]).slice(0, MAX_BATCH) : [];
      if (!ids.length) throw new Error("Vælg mindst ét lead");

      const ai = await getCompanyAI(supabase, companyId);
      if (!ai) return jsonError(AI_NOT_CONNECTED_MESSAGE, 400);

      const { data: withinQuota } = await supabase.rpc("increment_usage_quota", { _company_id: companyId, _quota_type: "ai_email_writer" });
      if (withinQuota === false) return jsonError("Monthly AI limit reached for your company.", 429);

      const [{ data: company }, { data: profile }, { data: rows, error }] = await Promise.all([
        supabase.from("companies").select("name, industry, website").eq("id", companyId).single(),
        supabase.from("profiles").select("full_name").eq("user_id", user.id).single(),
        supabase.from("linkedin_outreach").select("*").eq("company_id", companyId).in("id", ids),
      ]);
      if (error) throw new Error(error.message);

      let generated = 0;
      const failed: string[] = [];
      for (const row of rows ?? []) {
        const prompt = `Du skriver LinkedIn-outreach på dansk for en B2B-sælger.

AFSENDER: ${profile?.full_name || "Sælger"} fra ${company?.name || "vores virksomhed"} (${company?.industry || "branche ikke angivet"}, ${company?.website || ""})
MODTAGER: ${row.contact_name || "ukendt navn"}${row.contact_role ? `, ${row.contact_role}` : ""} hos ${row.company_name || "ukendt virksomhed"}

Skriv:
1. "connection_note": forbindelsesanmodning, MAKS ${NOTE_MAX} tegn inkl. mellemrum. Personlig, kort, ingen salgstale, ingen links, ingen emojis.
2. "followup_message": besked at sende EFTER forbindelsen er accepteret. 60-90 ord, én konkret værdi og et enkelt spørgsmål/CTA. Ingen opdigtede fakta om modtageren.

Svar KUN med gyldig JSON med nøglerne "connection_note" og "followup_message".`;

        try {
          const response = await fetch(ai.url, {
            method: "POST",
            headers: { Authorization: `Bearer ${ai.apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: ai.model, reasoning: { effort: "none" }, messages: [{ role: "user", content: prompt }] }),
          });
          if (!response.ok) {
            const { message } = await describeOpenAIError(response, ai.provider);
            throw new Error(message);
          }
          const aiData = await response.json();
          const parsed = parseJson(aiData.choices?.[0]?.message?.content || "");
          if (!parsed.connection_note || !parsed.followup_message) throw new Error("Incomplete AI response");

          const { error: updErr } = await supabase
            .from("linkedin_outreach")
            .update({
              connection_note: clampNote(parsed.connection_note),
              followup_message: parsed.followup_message.trim(),
              status: row.status === "draft" ? "ready" : row.status,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id)
            .eq("company_id", companyId);
          if (updErr) throw new Error(updErr.message);
          generated++;
        } catch (e) {
          console.error("linkedin-outreach draft failed", row.id, e);
          failed.push(row.id);
        }
      }
      return jsonResponse({ generated, failed });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 400);
  }
}));
