import { withSentry } from "../_shared/sentry.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCompanyAuth } from "../_shared/auth.ts";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // ms
const TIMEOUT_MS = 8000;

Deno.serve(withSentry("webhook-dispatch", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Caller identity and company_id are resolved from the verified JWT —
    // never trust a client-supplied company_id here.
    const auth = await requireCompanyAuth(req);
    if (auth instanceof Response) return auth;
    const { supabase, companyId: company_id } = auth;

    const { event, data, test_webhook_id } = await req.json();

    if (!event) {
      return new Response(JSON.stringify({ error: "Missing event" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get active webhooks for this event + company
    let webhooks: { id: string; url: string; secret_key: string | null }[];

    if (test_webhook_id) {
      // Test mode: fetch specific webhook, scoped to the caller's own company.
      const { data: wh } = await supabase
        .from("webhooks")
        .select("id, url, secret_key")
        .eq("id", test_webhook_id)
        .eq("company_id", company_id)
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
}));

// Tenant-supplied webhook URLs are fetched from our edge runtime, so they
// must not be able to reach loopback/link-local/private networks (SSRF) or
// use plain http. Hostnames are checked literally; IP literals are checked
// against the private ranges.
export function isSafeWebhookUrl(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return false;
  }
  if (host.includes(":")) {
    if (host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host.startsWith("::ffff:")) return false;
  }
  return true;
}

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

  if (!isSafeWebhookUrl(webhook.url)) {
    await supabase.from("webhook_logs").insert({
      webhook_id: webhook.id,
      company_id: companyId,
      event,
      status: "failed",
      status_code: null,
      response_body: "",
      payload,
      attempt: 0,
      error_message: "Blocked: webhook URL must be public https",
    });
    await supabase.rpc("update_webhook_counters", { _webhook_id: webhook.id, _success: false });
    return "failed";
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {

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
        redirect: "manual",
      });

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
    } finally {
      // previously only cleared on success, leaking a pending abort timer
      // on every thrown fetch
      clearTimeout(timer);
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
