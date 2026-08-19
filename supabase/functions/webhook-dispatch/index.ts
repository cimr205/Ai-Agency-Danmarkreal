import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // ms
const TIMEOUT_MS = 8000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { event, company_id, data, test_webhook_id } = await req.json();

    if (!event || !company_id) {
      return new Response(JSON.stringify({ error: "Missing event or company_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get active webhooks for this event + company
    let webhooks: { id: string; url: string; secret_key: string | null }[];

    if (test_webhook_id) {
      // Test mode: fetch specific webhook
      const { data: wh } = await supabase
        .from("webhooks")
        .select("id, url, secret_key")
        .eq("id", test_webhook_id)
        .single();
      webhooks = wh ? [wh] : [];
    } else {
      const { data: whs } = await supabase.rpc("get_active_webhooks_for_event", {
        _company_id: company_id,
        _event: event,
      });
      webhooks = whs || [];
    }

    if (webhooks.length === 0) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      tenant_id: company_id,
      data: data || {},
    };

    const results = await Promise.allSettled(
      webhooks.map((wh) => deliverWithRetry(supabase, wh, payload, company_id, event))
    );

    const summary = results.map((r, i) => ({
      webhook_id: webhooks[i].id,
      status: r.status === "fulfilled" ? r.value : "error",
    }));

    return new Response(JSON.stringify({ dispatched: webhooks.length, results: summary }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("webhook-dispatch error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function deliverWithRetry(
  supabase: SupabaseClient,
  webhook: { id: string; url: string; secret_key: string | null },
  payload: unknown,
  companyId: string,
  event: string,
) {
  let lastError = "";
  let lastStatusCode: number | null = null;
  let lastBody = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (webhook.secret_key) {
        // HMAC-SHA256 signature
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw", encoder.encode(webhook.secret_key),
          { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(JSON.stringify(payload)));
        headers["X-Webhook-Signature"] = Array.from(new Uint8Array(sig))
          .map(b => b.toString(16).padStart(2, "0")).join("");
      }

      const res = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      lastStatusCode = res.status;
      lastBody = (await res.text()).slice(0, 1000);

      if (res.ok) {
        // Log success
        await supabase.from("webhook_logs").insert({
          webhook_id: webhook.id,
          company_id: companyId,
          event,
          status: "success",
          status_code: res.status,
          response_body: lastBody,
          payload,
          attempt,
        });
        await supabase.rpc("update_webhook_counters", { _webhook_id: webhook.id, _success: true });
        return "success";
      }

      lastError = `HTTP ${res.status}`;
    } catch (e) {
      lastError = e.message || "Unknown error";
      lastStatusCode = null;
      lastBody = "";
    }

    // Wait before retry (except on last attempt)
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
    }
  }

  // All retries failed — log failure
  await supabase.from("webhook_logs").insert({
    webhook_id: webhook.id,
    company_id: companyId,
    event,
    status: "failed",
    status_code: lastStatusCode,
    response_body: lastBody,
    payload,
    attempt: MAX_RETRIES,
    error_message: lastError,
  });
  await supabase.rpc("update_webhook_counters", { _webhook_id: webhook.id, _success: false });
  return "failed";
}
