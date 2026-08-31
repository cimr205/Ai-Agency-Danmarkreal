// Workflow runner — executes a workflow row from `public.workflows`.
// Supports a simple sequence: trigger payload -> optional AI step -> action.
// Mode: "test" returns a per-step trace without firing webhooks; "live" performs the action.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { getCompanyAI, AI_NOT_CONNECTED_MESSAGE } from "../_shared/aiConnection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await supabase
      .from("profiles").select("company_id").eq("user_id", user.id).maybeSingle();
    const companyId = profile?.company_id;
    if (!companyId) return json({ error: "No company" }, 400);

    const { workflow_id, payload = {}, mode = "test", ai_prompt } =
      await req.json() as { workflow_id: string; payload?: Record<string, unknown>; mode?: "test" | "live"; ai_prompt?: string };

    const { data: wf, error: wfErr } = await supabase
      .from("workflows").select("*").eq("id", workflow_id).eq("company_id", companyId).maybeSingle();
    if (wfErr || !wf) return json({ error: "Workflow not found" }, 404);

    const trace: Array<{ step: string; status: "ok" | "skip" | "error"; detail: string; data?: unknown }> = [];

    // Step 1 — trigger
    trace.push({ step: `trigger:${wf.trigger_event}`, status: "ok", detail: "Trigger payload modtaget", data: payload });

    // Step 2 — optional AI reasoning
    let aiOutput: string | null = null;
    if (ai_prompt) {
      const ai = await getCompanyAI(supabase, companyId);
      if (!ai) {
        trace.push({ step: "ai", status: "error", detail: AI_NOT_CONNECTED_MESSAGE });
      } else {
        const res = await fetch(ai.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${ai.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ai.model,
            messages: [
              { role: "system", content: "Du er et workflow-AI-trin. Svar kort og konkret." },
              { role: "user", content: `${ai_prompt}\n\nPayload: ${JSON.stringify(payload)}` },
            ],
          }),
        });
        if (res.ok) {
          const j = await res.json();
          aiOutput = j.choices?.[0]?.message?.content ?? null;
          trace.push({ step: "ai", status: "ok", detail: aiOutput?.slice(0, 240) ?? "(tomt)" });
        } else {
          trace.push({ step: "ai", status: "error", detail: `AI fejl ${res.status}` });
        }
      }
    }

    // Step 3 — action
    if (mode === "test") {
      trace.push({ step: `action:${wf.action_type}`, status: "skip", detail: "Test-tilstand · handling ikke udført" });
    } else if (wf.action_type === "webhook" && wf.webhook_url) {
      try {
        const r = await fetch(wf.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: wf.trigger_event, payload, ai_output: aiOutput }),
        });
        trace.push({ step: "action:webhook", status: r.ok ? "ok" : "error", detail: `HTTP ${r.status}` });
        await supabase.from("workflows")
          .update({
            run_count: (wf.run_count ?? 0) + 1,
            last_run_at: new Date().toISOString(),
            last_error: r.ok ? null : `HTTP ${r.status}`,
          }).eq("id", wf.id);
      } catch (e) {
        trace.push({ step: "action:webhook", status: "error", detail: e instanceof Error ? e.message : "fetch failed" });
      }
    } else if (wf.action_type === "run_integration" && wf.action_capability && wf.action_tool_slug) {
      // Runs a tool through whichever connected integration satisfies the
      // declared capability — the same Capability Engine that powers
      // Calendar and Documents, now reachable from a workflow action too.
      // Resolution, ownership checks, and audit logging all live in
      // composio-integration; this just forwards the caller's own auth.
      try {
        const resolveRes = await callComposioIntegration(authHeader, "resolve-capability", { capability: wf.action_capability });
        const resolved = (resolveRes as { resolved?: { id: string; provider: string } | null }).resolved;
        if (!resolved) {
          trace.push({ step: "action:run_integration", status: "error", detail: `Ingen forbindelse understøtter ${wf.action_capability}` });
        } else {
          const filledArgs = interpolate(wf.action_arguments ?? {}, { ...payload, ai_output: aiOutput });
          const execRes = await callComposioIntegration(authHeader, "execute-tool", {
            integrationId: resolved.id,
            toolSlug: wf.action_tool_slug,
            actionCategory: categoryForCapability(wf.action_capability),
            arguments: filledArgs,
          });
          trace.push({ step: `action:${wf.action_tool_slug}`, status: "ok", detail: `Kørt via ${resolved.provider}`, data: execRes });
          await supabase.from("workflows")
            .update({ run_count: (wf.run_count ?? 0) + 1, last_run_at: new Date().toISOString(), last_error: null })
            .eq("id", wf.id);
        }
      } catch (e) {
        const detail = e instanceof Error ? e.message : "Handling fejlede";
        trace.push({ step: "action:run_integration", status: "error", detail });
        await supabase.from("workflows").update({ last_error: detail }).eq("id", wf.id);
      }
    } else {
      trace.push({ step: `action:${wf.action_type}`, status: "skip", detail: "Handlingstype ikke understøttet endnu" });
    }

    await supabase.from("activity_logs").insert({
      user_id: user.id,
      company_id: companyId,
      action_type: mode === "test" ? "workflow_test" : "workflow_run",
      entity_type: "workflow",
      entity_id: wf.id,
      description: `Workflow "${wf.description ?? wf.trigger_event}" ${mode === "test" ? "testet" : "kørt"}`,
      metadata: { trace, payload },
    });

    return json({ ok: true, trace, ai_output: aiOutput });
  } catch (e) {
    console.error("workflow-runner error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Forwards the calling user's own auth to composio-integration so every
// ownership check, capability resolution, and audit log entry there
// applies exactly as if the frontend had called it directly.
async function callComposioIntegration(authHeader: string, action: string, body: Record<string, unknown>) {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/composio-integration`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: anonKey },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(data?.error ?? `composio-integration fejlede (${res.status})`);
  return data;
}

// Resolves {{field}} placeholders in string argument values against the
// trigger payload. Deliberately shallow and string-only — this is a
// workflow argument template, not a general expression language.
function interpolate(args: Record<string, unknown>, context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      out[key] = value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
        const found = path.split(".").reduce<unknown>((acc, part) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined), context);
        return found === undefined || found === null ? "" : String(found);
      });
    } else {
      out[key] = value;
    }
  }
  return out;
}

// actionCategory drives approval requirements in composio-integration —
// derived from the capability's own shape so no per-provider mapping is
// needed here. Conservative default (write) when the suffix is ambiguous.
function categoryForCapability(capability: string): string {
  if (capability.endsWith(".send")) return "communication";
  if (capability.startsWith("payments")) return "financial";
  if (capability.endsWith(".write")) return "write";
  return "write";
}
