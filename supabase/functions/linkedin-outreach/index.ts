import { withSentry } from "../_shared/sentry.ts";
import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getCompanyAI, AI_NOT_CONNECTED_MESSAGE, describeOpenAIError } from "../_shared/aiConnection.ts";
import { buildOutreachRows, clampNote } from "../_shared/linkedinOutreach.ts";

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

function parseJson(raw: string): { connection_note?: string; followup_message?: string } {
  const clean = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean);
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
      const parsed = await res.json().catch(() => null) as { data?: Record<string, unknown>; successful?: boolean; error?: string | null } | null;
      // HTTP 200 does not mean the tool call succeeded — Composio signals
      // per-call failure (revoked token, missing scope, provider error) via
      // `successful: false` in the body, not via HTTP status. `response_data`
      // is the wrapper key Composio actually uses for the raw provider
      // response elsewhere in this codebase (see composio-integration's
      // Notion/HubSpot/Stripe tool calls); `response_dict` is kept only as a
      // defensive fallback in case this specific tool differs.
      const connected = res.ok && parsed?.successful === true;
      if (!connected) {
        console.error("linkedin-outreach account check failed", res.status, parsed?.error ?? parsed);
      }
      const d = (parsed?.data?.response_data ?? parsed?.data?.response_dict ?? parsed?.data ?? {}) as Record<string, unknown>;
      const name = [d.localizedFirstName ?? d.given_name, d.localizedLastName ?? d.family_name].filter(Boolean).join(" ")
        || (d.name as string | undefined) || null;
      return jsonResponse({ connected, name: connected ? name : null });
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

      const { rows, noProfile } = buildOutreachRows(results ?? [], companyId, user.id);

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
            body: JSON.stringify({ model: ai.model, models: ai.models, reasoning: { effort: "none" }, messages: [{ role: "user", content: prompt }] }),
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
