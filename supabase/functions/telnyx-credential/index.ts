import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";

// All privileged Telnyx operations happen here, server-side, using
// TELNYX_API_KEY from the edge function's environment. The browser NEVER
// sees the API key — only a short-lived on-demand login_token scoped to one
// user's own telephony credential.

const TELNYX_API = "https://api.telnyx.com/v2";

function telnyxHeaders() {
  const apiKey = Deno.env.get("TELNYX_API_KEY");
  if (!apiKey) throw new Error("TELNYX_API_KEY is not configured");
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

async function telnyxFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${TELNYX_API}${path}`, { ...init, headers: { ...telnyxHeaders(), ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await requireCompanyAuth(req);
  if (ctx instanceof Response) return ctx;
  const { supabase, user, companyId } = ctx;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // no body
  }
  const action = body.action as string | undefined;

  try {
    // ─── Diagnostic: validate the API key without creating any billable resource ───
    if (action === "auth-check") {
      const result = await telnyxFetch("/available_phone_numbers?filter[country_code]=DK&filter[limit]=1");
      if (!result.ok) {
        return jsonResponse({ authenticated: false, status: result.status, error: result.body });
      }
      return jsonResponse({ authenticated: true });
    }

    // ─── One-time: fetch the account's webhook Ed25519 public key so it can be stored as TELNYX_PUBLIC_KEY ───
    if (action === "get-public-key") {
      const result = await telnyxFetch("/public_key");
      if (!result.ok) throw new Error(`Kunne ikke hente public key: ${JSON.stringify(result.body)}`);
      return jsonResponse({ publicKey: result.body?.data?.public ?? result.body });
    }

    // ─── Admin: is this company's Telnyx connection configured? ───
    if (action === "config-status") {
      const { data } = await supabase.from("telnyx_config").select("*").eq("company_id", companyId).maybeSingle();
      return jsonResponse({ configured: !!data, status: data?.status ?? "configuration_error", fromNumber: data?.default_from_number ?? null });
    }

    // ─── Admin: create (or reuse) this company's Credential Connection ───
    if (action === "setup-connection") {
      const { data: isAdmin } = await supabase.rpc("is_company_admin", { _user_id: user.id });
      if (!isAdmin) throw new Error("Kun administratorer kan konfigurere opkaldsforbindelsen.");

      const { data: existing } = await supabase.from("telnyx_config").select("*").eq("company_id", companyId).maybeSingle();
      if (existing) return jsonResponse({ connectionId: existing.connection_id, status: existing.status });

      const created = await telnyxFetch("/credential_connections", {
        method: "POST",
        body: JSON.stringify({
          connection_name: `crm-${companyId}`,
          user_name: `crm${companyId.replace(/-/g, "").slice(0, 29)}`,
          password: crypto.randomUUID(),
          webhook_event_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/telnyx-webhook`,
        }),
      });
      if (!created.ok) throw new Error(`Kunne ikke oprette Telnyx-forbindelse: ${JSON.stringify(created.body)}`);

      const connectionId = created.body?.data?.id;
      const { error: insertError } = await supabase.from("telnyx_config").insert({
        company_id: companyId,
        connection_id: connectionId,
        status: "degraded", // ready once a from_number is set
      });
      if (insertError) throw new Error(insertError.message);

      return jsonResponse({ connectionId, status: "degraded" });
    }

    // ─── Admin: set the default outbound caller ID once a number is owned ───
    if (action === "set-from-number") {
      const { data: isAdmin } = await supabase.rpc("is_company_admin", { _user_id: user.id });
      if (!isAdmin) throw new Error("Kun administratorer kan ændre afsendernummeret.");
      const fromNumber = body.fromNumber as string;
      if (!fromNumber) throw new Error("Missing fromNumber");

      const { error } = await supabase
        .from("telnyx_config")
        .update({ default_from_number: fromNumber, status: "ready" })
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
      return jsonResponse({ success: true });
    }

    // ─── Every user: mint a short-lived browser login token ───
    if (action === "get-token") {
      const { data: config } = await supabase.from("telnyx_config").select("*").eq("company_id", companyId).maybeSingle();
      if (!config || config.status !== "ready") {
        throw new Error("Opkaldsforbindelsen er ikke sat op for jeres virksomhed endnu.");
      }

      let { data: cred } = await supabase
        .from("telnyx_credentials")
        .select("telnyx_credential_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!cred) {
        const created = await telnyxFetch("/telephony_credentials", {
          method: "POST",
          body: JSON.stringify({ connection_id: config.connection_id, name: `user-${user.id}` }),
        });
        if (!created.ok) throw new Error(`Kunne ikke oprette login til telefoni: ${JSON.stringify(created.body)}`);
        const telnyxCredentialId = created.body?.data?.id;

        const { error: insertError } = await supabase
          .from("telnyx_credentials")
          .insert({ company_id: companyId, user_id: user.id, telnyx_credential_id: telnyxCredentialId });
        if (insertError) throw new Error(insertError.message);
        cred = { telnyx_credential_id: telnyxCredentialId };
      }

      const tokenRes = await telnyxFetch(`/telephony_credentials/${cred.telnyx_credential_id}/token`, { method: "POST" });
      if (!tokenRes.ok) throw new Error(`Kunne ikke generere login-token: ${JSON.stringify(tokenRes.body)}`);

      // The token endpoint returns the JWT as a raw string in `data` for this Telnyx API.
      const loginToken = typeof tokenRes.body === "string" ? tokenRes.body : tokenRes.body?.data ?? tokenRes.body;
      return jsonResponse({ loginToken, fromNumber: config.default_from_number });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 400);
  }
});

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
