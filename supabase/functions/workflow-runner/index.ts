// Workflow runner — executes a workflow row from `public.workflows`.
// Supports a simple sequence: trigger payload -> optional AI step -> action.
// Mode: "test" returns a per-step trace without firing webhooks; "live" performs the action.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_AI_URL = (Deno.env.get("AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev/v1/chat/completions");

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
      await req.json() as { workflow_id: string; payload?: any; mode?: "test" | "live"; ai_prompt?: string };

    const { data: wf, error: wfErr } = await supabase
      .from("workflows").select("*").eq("id", workflow_id).eq("company_id", companyId).maybeSingle();
    if (wfErr || !wf) return json({ error: "Workflow not found" }, 404);

    const trace: Array<{ step: string; status: "ok" | "skip" | "error"; detail: string; data?: any }> = [];

    // Step 1 — trigger
    trace.push({ step: `trigger:${wf.trigger_event}`, status: "ok", detail: "Trigger payload modtaget", data: payload });

    // Step 2 — optional AI reasoning
    let aiOutput: string | null = null;
    if (ai_prompt) {
      const key = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"));
      if (!key) {
        trace.push({ step: "ai", status: "error", detail: "LOVABLE_API_KEY mangler" });
      } else {
        const res = await fetch(LOVABLE_AI_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
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
      } catch (e: any) {
        trace.push({ step: "action:webhook", status: "error", detail: e?.message ?? "fetch failed" });
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
  } catch (e: any) {
    console.error("workflow-runner error", e);
    return json({ error: e?.message ?? "Unknown" }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
