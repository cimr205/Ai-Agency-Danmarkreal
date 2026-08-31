import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Central, generic integration service (IntegrationService). No feature in
// the app talks to Composio directly — everything goes through this
// function. The single platform-level COMPOSIO_API_KEY never leaves this
// server-side context.
//
// Tenant identity: Composio's "user_id" is deterministically our own
// company_id (uuid) — one Composio end-user per organization, never shared,
// never trusted from the frontend (resolved server-side via requireCompanyAuth).
//
// The local `integrations` table is the registry/authorization layer —
// Composio itself is the credential vault. We never store OAuth tokens here.

const COMPOSIO_API = "https://backend.composio.dev/api/v3";
const CALLBACK_URL = "https://www.aiagencydanmark.dk/en/app/workspace/connected-apps";

function composioHeaders() {
  const apiKey = Deno.env.get("COMPOSIO_API_KEY");
  if (!apiKey) throw new Error("COMPOSIO_API_KEY is not configured");
  return { "x-api-key": apiKey, "Content-Type": "application/json" };
}

async function composioFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${COMPOSIO_API}${path}`, { ...init, headers: { ...composioHeaders(), ...(init?.headers ?? {}) } });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

// Composio-managed auth configs are per-toolkit, shared across every
// tenant (they just describe "how do we auth with Gmail" / "how do we auth
// with Shopify"), not per-company secrets — so we look one up before
// creating a duplicate.
//
// Every toolkit gets a real, working connect flow through this function:
// - If Composio brokers OAuth2 centrally (its own shared app credentials),
//   we use that.
// - Otherwise, if the toolkit supports any direct-credential scheme
//   (API key, bearer token, basic auth — the vast majority of toolkits
//   that aren't OAuth2), we create a "use_custom_auth" config for that
//   scheme. Composio's own hosted connect page then collects the actual
//   credential from the user — we never see or store it.
// - Only toolkits that require the tenant's own OAuth app (their own
//   client_id/client_secret registered with the provider) can't be
//   connected in one click yet — that's a real, honest limit, not a
//   fallback to a manual webhook bridge.
const NON_OAUTH_SCHEME_PREFERENCE = ["API_KEY", "BEARER_TOKEN", "BASIC", "BASIC_WITH_JWT"];

async function getOrCreateAuthConfig(toolkitSlug: string): Promise<string> {
  const existing = await composioFetch(`/auth_configs?toolkit_slug=${encodeURIComponent(toolkitSlug)}&limit=1`);
  const items = (existing.body as { items?: Array<{ id: string }> })?.items ?? [];
  if (items[0]?.id) return items[0].id;

  const toolkitInfo = await composioFetch(`/toolkits/${encodeURIComponent(toolkitSlug)}`);
  const info = toolkitInfo.body as { composio_managed_auth_schemes?: string[]; auth_schemes?: string[] };
  const managedSchemes = info?.composio_managed_auth_schemes ?? [];
  const allSchemes = info?.auth_schemes ?? [];

  let authConfigBody: Record<string, unknown>;
  if (managedSchemes.includes("OAUTH2")) {
    authConfigBody = { type: "use_composio_managed_auth" };
  } else {
    const scheme = NON_OAUTH_SCHEME_PREFERENCE.find((s) => allSchemes.includes(s));
    if (!scheme) {
      throw new Error(
        `${toolkitSlug} kræver jeres egen OAuth-app hos udbyderen og kan ikke forbindes automatisk endnu.`,
      );
    }
    authConfigBody = { type: "use_custom_auth", authScheme: scheme, credentials: {} };
  }

  const created = await composioFetch("/auth_configs", {
    method: "POST",
    body: JSON.stringify({ toolkit: { slug: toolkitSlug }, auth_config: authConfigBody }),
  });
  const authConfigId = (created.body as { auth_config?: { id?: string } })?.auth_config?.id;
  if (!created.ok || !authConfigId) {
    throw new Error(`Kunne ikke konfigurere ${toolkitSlug}: ${JSON.stringify(created.body)}`);
  }
  return authConfigId;
}

// Same scheme logic as getOrCreateAuthConfig, exposed read-only so the
// frontend can decide whether to show a working "Forbind" button at all,
// without creating an auth config just to render the catalog.
function toolkitIsConnectable(t: { composio_managed_auth_schemes?: string[]; auth_schemes?: string[] }): boolean {
  const managed = t.composio_managed_auth_schemes ?? [];
  if (managed.includes("OAUTH2")) return true;
  const all = t.auth_schemes ?? [];
  return NON_OAUTH_SCHEME_PREFERENCE.some((s) => all.includes(s));
}

// action categorization drives approval requirements later — kept generic,
// no per-provider hardcoding. Callers must declare the category up front.
const VALID_CATEGORIES = ["read", "write", "destructive", "financial", "communication"];

// ─── Capability Engine ───────────────────────────────────────────────────
// The generic layer the whole "connect once, use everywhere" architecture
// hangs off: CONNECTED ACCOUNT → CAPABILITIES → MODULE. Only two static
// maps need editing to plug in a new toolkit or module — no per-provider
// backend code. Real product modules ask "do we have email.read?", never
// "is Gmail connected?".
type Capability =
  | "email.read" | "email.send"
  | "calendar.read" | "calendar.write"
  | "crm.read" | "crm.write"
  | "commerce.products.read" | "commerce.products.write" | "commerce.orders.read"
  | "ads.read" | "ads.write"
  | "payments.read"
  | "documents.read" | "documents.write"
  | "analytics.read"
  | "messaging.send";

const TOOLKIT_CAPABILITIES: Record<string, Capability[]> = {
  gmail: ["email.read", "email.send"],
  outlook: ["email.read", "email.send", "calendar.read", "calendar.write"],
  googlecalendar: ["calendar.read", "calendar.write"],
  calendly: ["calendar.read"],
  slack: ["messaging.send"],
  hubspot: ["crm.read", "crm.write"],
  pipedrive: ["crm.read", "crm.write"],
  salesforce: ["crm.read", "crm.write"],
  shopify: ["commerce.products.read", "commerce.products.write", "commerce.orders.read"],
  metaads: ["ads.read", "ads.write", "analytics.read"],
  stripe: ["payments.read"],
  googledrive: ["documents.read", "documents.write"],
  notion: ["documents.read", "documents.write"],
  github: ["documents.read"],
  klaviyo: ["ads.read", "messaging.send"],
  mailchimp: ["email.send", "ads.read"],
  posthog: ["analytics.read"],
  mixpanel: ["analytics.read"],
  googlesheets: ["documents.read", "documents.write"],
  googledocs: ["documents.read", "documents.write"],
  airtable: ["documents.read", "documents.write"],
};

const MODULE_REQUIREMENTS: Record<string, Capability[]> = {
  smartInbox: ["email.read"],
  calendar: ["calendar.read"],
  shopOptimizer: ["commerce.products.read", "commerce.orders.read"],
  marketing: ["ads.read"],
  finance: ["payments.read"],
  crmSync: ["crm.read"],
  documents: ["documents.read"],
  notifications: ["messaging.send"],
};

// Resolves which of this company's CONNECTED integrations satisfies a
// capability. Only ever reads rows already scoped to companyId by the
// caller — never trusts a connection id passed from the frontend.
function findConnectionForCapability(
  connections: Array<{ id: string; provider: string; status: string }>,
  capability: Capability,
): { id: string; provider: string } | null {
  const match = connections.find(
    (c) => c.status === "connected" && (TOOLKIT_CAPABILITIES[c.provider] ?? []).includes(capability),
  );
  return match ? { id: match.id, provider: match.provider } : null;
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
    // ─── Catalog: list toolkits available to connect ───
    if (action === "list-toolkits") {
      const limit = Math.min(Math.max((body.limit as number) || 100, 1), 300);
      const r = await composioFetch(`/toolkits?limit=${limit}`);
      if (!r.ok) throw new Error(`Kunne ikke hente integrationskatalog: ${JSON.stringify(r.body)}`);
      const items = (r.body as { items?: Array<{ composio_managed_auth_schemes?: string[]; auth_schemes?: string[] }> })?.items ?? [];
      const withConnectable = items.map((t) => ({ ...t, connectable: toolkitIsConnectable(t) }));
      return jsonResponse({ toolkits: withConnectable });
    }

    // ─── This tenant's connections (local registry — no Composio call needed) ───
    if (action === "list-connections") {
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return jsonResponse({ connections: data ?? [] });
    }

    // ─── Start connecting a toolkit: returns a redirect_url for the user to complete OAuth ───
    if (action === "create-connection") {
      const toolkitSlug = body.toolkit as string;
      if (!toolkitSlug) throw new Error("Missing toolkit");

      const authConfigId = await getOrCreateAuthConfig(toolkitSlug);

      const link = await composioFetch("/connected_accounts/link", {
        method: "POST",
        body: JSON.stringify({ auth_config_id: authConfigId, user_id: companyId, callback_url: CALLBACK_URL }),
      });
      const linkBody = link.body as { redirect_url?: string; connected_account_id?: string };
      if (!link.ok || !linkBody.redirect_url || !linkBody.connected_account_id) {
        throw new Error(`Kunne ikke starte forbindelse: ${JSON.stringify(link.body)}`);
      }

      const { error: upsertError } = await supabase.from("integrations").upsert(
        {
          company_id: companyId,
          provider: toolkitSlug,
          status: "pending",
          composio_connection_id: linkBody.connected_account_id,
          composio_auth_config_id: authConfigId,
          connected_by: user.id,
        },
        { onConflict: "company_id,provider" },
      );
      if (upsertError) throw new Error(upsertError.message);

      return jsonResponse({ redirectUrl: linkBody.redirect_url, connectionId: linkBody.connected_account_id });
    }

    // ─── Called when the user returns from the OAuth redirect — checks real status with Composio ───
    if (action === "sync-connection-status") {
      const connectionId = body.connectionId as string;
      if (!connectionId) throw new Error("Missing connectionId");

      const { data: row } = await supabase
        .from("integrations")
        .select("id, composio_connection_id")
        .eq("company_id", companyId)
        .eq("composio_connection_id", connectionId)
        .maybeSingle();
      if (!row) throw new Error("Forbindelse ikke fundet for jeres virksomhed");

      const remote = await composioFetch(`/connected_accounts/${connectionId}`);
      const remoteStatus = (remote.body as { status?: string })?.status;
      const localStatus = remoteStatus === "ACTIVE" ? "connected" : remoteStatus === "FAILED" ? "error" : "pending";

      const { error: updateError } = await supabase
        .from("integrations")
        .update({ status: localStatus, connected_at: localStatus === "connected" ? new Date().toISOString() : null })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);

      return jsonResponse({ status: localStatus });
    }

    // ─── Disconnect: revoke with Composio, then update the local registry ───
    if (action === "disconnect-connection") {
      const integrationId = body.integrationId as string;
      if (!integrationId) throw new Error("Missing integrationId");

      const { data: row } = await supabase
        .from("integrations")
        .select("id, composio_connection_id")
        .eq("id", integrationId)
        .eq("company_id", companyId) // ownership check — cannot disconnect another tenant's row
        .maybeSingle();
      if (!row) throw new Error("Forbindelse ikke fundet for jeres virksomhed");

      if (row.composio_connection_id) {
        await composioFetch(`/connected_accounts/${row.composio_connection_id}`, { method: "DELETE" });
      }

      const { error: updateError } = await supabase
        .from("integrations")
        .update({ status: "disconnected", composio_connection_id: null })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);

      return jsonResponse({ success: true });
    }

    // ─── Execute a tool through a tenant's connection — the only path any
    // feature or AI agent may use to call out to a connected integration. ───
    // ─── Capability Engine: which product modules can actually light up for this tenant? ───
    if (action === "module-availability") {
      const { data: connections } = await supabase
        .from("integrations")
        .select("id, provider, status")
        .eq("company_id", companyId);
      const rows = connections ?? [];

      const modules = Object.entries(MODULE_REQUIREMENTS).map(([module, required]) => {
        const resolved = required.map((cap) => ({ capability: cap, connection: findConnectionForCapability(rows, cap) }));
        const available = resolved.every((r) => r.connection !== null);
        return {
          module,
          available,
          requiredCapabilities: required,
          resolvedConnections: resolved
            .filter((r) => r.connection)
            .map((r) => ({ capability: r.capability, connectionId: r.connection!.id, provider: r.connection!.provider })),
        };
      });

      return jsonResponse({ modules });
    }

    // ─── Capability Engine: resolve one capability to a connection, server-side only ───
    if (action === "resolve-capability") {
      const capability = body.capability as Capability;
      if (!capability) throw new Error("Missing capability");

      const { data: connections } = await supabase
        .from("integrations")
        .select("id, provider, status")
        .eq("company_id", companyId);
      const resolved = findConnectionForCapability(connections ?? [], capability);
      if (!resolved) return jsonResponse({ resolved: null });
      return jsonResponse({ resolved });
    }

    // ─── Documents module: first real feature built on the Capability Engine.
    // Provider-specific tool calls/response shapes live ONLY here — the
    // frontend only ever sees the normalized shape. Add a new provider by
    // adding one entry to this registry, nothing else changes upstream. ───
    if (action === "list-documents") {
      const { data: connections } = await supabase
        .from("integrations")
        .select("id, provider, status, composio_connection_id")
        .eq("company_id", companyId);
      const resolved = findConnectionForCapability(connections ?? [], "documents.read");
      if (!resolved) throw new Error("Ingen forbindelse understøtter dokumenter endnu.");
      const connection = (connections ?? []).find((c) => c.id === resolved.id);
      if (!connection?.composio_connection_id) throw new Error("Forbindelsen mangler et Composio-connection-id.");

      interface NormalizedDoc { id: string; title: string; url: string | null; lastEditedAt: string | null; icon: string | null }

      async function callTool(toolSlug: string, args: Record<string, unknown>) {
        const res = await composioFetch(`/tools/execute/${toolSlug}`, {
          method: "POST",
          body: JSON.stringify({ user_id: companyId, connected_account_id: connection!.composio_connection_id, arguments: args }),
        });
        if (!res.ok) throw new Error(`Værktøjskald fejlede: ${JSON.stringify(res.body)}`);
        return res.body as { data?: Record<string, unknown> };
      }

      let docs: NormalizedDoc[] = [];

      if (resolved.provider === "notion") {
        const result = await callTool("NOTION_SEARCH_NOTION_PAGE", { query: "", page_size: 20 });
        interface NotionResult {
          id: string; url?: string; public_url?: string; last_edited_time?: string;
          icon?: { type?: string; emoji?: string };
          properties?: Record<string, { type: string; title?: Array<{ plain_text?: string }> }>;
        }
        const items = ((result.data?.response_data as { results?: NotionResult[] })?.results ?? []);
        docs = items.map((p) => {
          const titleProp = p.properties ? Object.values(p.properties).find((prop) => prop.type === "title") : undefined;
          const title = titleProp?.title?.map((t) => t.plain_text ?? "").join("") || "Uden titel";
          return {
            id: p.id,
            title,
            url: p.public_url ?? p.url ?? null,
            lastEditedAt: p.last_edited_time ?? null,
            icon: p.icon?.type === "emoji" ? p.icon.emoji ?? null : null,
          };
        });
      } else {
        throw new Error(`${resolved.provider} er forbundet, men understøttes ikke af dokument-modulet endnu.`);
      }

      return jsonResponse({ provider: resolved.provider, connectionId: resolved.id, documents: docs });
    }

    if (action === "execute-tool") {
      const integrationId = body.integrationId as string;
      const toolSlug = body.toolSlug as string;
      const actionCategory = body.actionCategory as string;
      const toolArguments = (body.arguments as Record<string, unknown>) ?? {};
      const agentId = body.agentId as string | undefined;

      if (!integrationId || !toolSlug || !actionCategory) throw new Error("Missing integrationId, toolSlug, or actionCategory");
      if (!VALID_CATEGORIES.includes(actionCategory)) throw new Error(`Invalid actionCategory: ${actionCategory}`);

      const { data: row } = await supabase
        .from("integrations")
        .select("id, provider, composio_connection_id, status")
        .eq("id", integrationId)
        .eq("company_id", companyId) // cross-tenant execution is impossible past this check
        .maybeSingle();
      if (!row) throw new Error("Forbindelse ikke fundet for jeres virksomhed");
      if (row.status !== "connected" || !row.composio_connection_id) {
        throw new Error("Forbindelsen er ikke aktiv endnu.");
      }

      const { data: logRow, error: logError } = await supabase
        .from("integration_execution_logs")
        .insert({
          company_id: companyId,
          user_id: user.id,
          agent_id: agentId ?? null,
          integration_id: row.id,
          provider: row.provider,
          tool_slug: toolSlug,
          action_category: actionCategory,
          sanitized_input: toolArguments, // caller is responsible for not including secrets here
          status: "pending",
        })
        .select("id")
        .single();
      if (logError) throw new Error(logError.message);

      try {
        const result = await composioFetch(`/tools/execute/${toolSlug}`, {
          method: "POST",
          body: JSON.stringify({ user_id: companyId, connected_account_id: row.composio_connection_id, arguments: toolArguments }),
        });
        if (!result.ok) throw new Error(JSON.stringify(result.body));

        await supabase
          .from("integration_execution_logs")
          .update({ status: "success", completed_at: new Date().toISOString() })
          .eq("id", logRow.id);

        return jsonResponse({ result: result.body });
      } catch (execErr) {
        const message = execErr instanceof Error ? execErr.message : String(execErr);
        await supabase
          .from("integration_execution_logs")
          .update({ status: "failed", error: message, completed_at: new Date().toISOString() })
          .eq("id", logRow.id);
        throw new Error(message);
      }
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
