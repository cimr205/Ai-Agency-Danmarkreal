// MCP server exposing the company's business OS to AI clients (Claude Code,
// Claude Desktop, Cursor, Zed, etc.) via the Model Context Protocol.
// Auth: Authorization: Bearer <mcp_token>
import { Hono } from "npm:hono@4";
import { McpServer, StreamableHttpTransport } from "npm:mcp-lite@^0.10.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

type Ctx = { companyId: string; userId: string; tokenId: string };

async function authenticate(req: Request): Promise<Ctx | null> {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  if (!token.startsWith("mcp_")) return null;

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data, error } = await sb.rpc("resolve_mcp_token", { _token: token });
  interface ResolvedToken { token_id: string; company_id: string; user_id: string }
  if (error || !data || (data as ResolvedToken[]).length === 0) return null;
  const row = (data as ResolvedToken[])[0];
  // Touch last_used_at (best-effort)
  sb.from("mcp_tokens").update({ last_used_at: new Date().toISOString() })
    .eq("id", row.token_id).then(() => {});
  return { companyId: row.company_id, userId: row.user_id, tokenId: row.token_id };
}

function buildServer(ctx: Ctx) {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
    global: { headers: { "x-mcp-user": ctx.userId } },
  });

  const mcp = new McpServer({
    name: "lovable-business-os",
    version: "1.0.0",
  });

  // ---- READ TOOLS ---------------------------------------------------------

  mcp.tool({
    name: "list_leads",
    description: "List leads/prospects from the CRM. Filters by status and limit.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "new, contacted, qualified, lost, won" },
        limit: { type: "number", default: 25 },
      },
    },
    handler: async ({ status, limit }: { status?: string; limit?: number }) => {
      let q = sb.from("leads").select("id,name,email,company,status,score,created_at")
        .eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(Math.min(limit ?? 25, 100));
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  mcp.tool({
    name: "list_deals",
    description: "List sales deals from the pipeline.",
    inputSchema: { type: "object", properties: { stage: { type: "string" }, limit: { type: "number", default: 25 } } },
    handler: async ({ stage, limit }: { stage?: string; limit?: number }) => {
      let q = sb.from("deals").select("id,title,value,stage,expected_close_date,customer_id,created_at")
        .eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(Math.min(limit ?? 25, 100));
      if (stage) q = q.eq("stage", stage);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  mcp.tool({
    name: "list_tasks",
    description: "List tasks for the company.",
    inputSchema: { type: "object", properties: { status: { type: "string" }, limit: { type: "number", default: 25 } } },
    handler: async ({ status, limit }: { status?: string; limit?: number }) => {
      let q = sb.from("tasks").select("id,title,description,status,due_date,assigned_to,created_at")
        .eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(Math.min(limit ?? 25, 100));
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  mcp.tool({
    name: "list_integrations",
    description: "List external services connected to the workspace (webhooks, Gmail, Twilio, etc.).",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const { data, error } = await sb.from("integrations")
        .select("provider,status,account_label,connected_at,last_sync_at")
        .eq("company_id", ctx.companyId);
      if (error) throw new Error(error.message);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  // ---- WRITE TOOLS --------------------------------------------------------

  mcp.tool({
    name: "create_lead",
    description: "Create a new lead in the CRM.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        company: { type: "string" },
        phone: { type: "string" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
    handler: async ({ name, email, company, phone, notes }: { name: string; email?: string; company?: string; phone?: string; notes?: string }) => {
      const { data, error } = await sb.from("leads").insert({
        company_id: ctx.companyId, created_by: ctx.userId,
        name, email, company, phone, notes, status: "new",
      }).select().single();
      if (error) throw new Error(error.message);
      return { content: [{ type: "text", text: `Created lead ${data.id}: ${data.name}` }] };
    },
  });

  mcp.tool({
    name: "create_task",
    description: "Create a task for the company.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        due_date: { type: "string", description: "ISO date" },
      },
      required: ["title"],
    },
    handler: async ({ title, description, due_date }: { title: string; description?: string; due_date?: string }) => {
      const { data, error } = await sb.from("tasks").insert({
        company_id: ctx.companyId, created_by: ctx.userId,
        title, description, due_date, status: "pending",
      }).select().single();
      if (error) throw new Error(error.message);
      return { content: [{ type: "text", text: `Created task ${data.id}: ${data.title}` }] };
    },
  });

  mcp.tool({
    name: "trigger_webhook",
    description: "Fire a connected webhook integration (Zapier/Make/n8n/Activepieces). Use to send actions to Slack, Gmail, HubSpot, Stripe etc. via the open-source bridge.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "e.g. slack, gmail, hubspot — must match a connected integration" },
        payload: { type: "object", description: "JSON body to POST to the webhook" },
      },
      required: ["provider", "payload"],
    },
    handler: async ({ provider, payload }: { provider: string; payload: unknown }) => {
      const { data: integ } = await sb.from("integrations")
        .select("metadata,status").eq("company_id", ctx.companyId).eq("provider", provider).maybeSingle();
      if (!integ || integ.status !== "connected") throw new Error(`No connected integration for ${provider}`);
      const url = (integ.metadata as { webhook_url?: string } | null)?.webhook_url;
      if (!url) throw new Error(`No webhook URL stored for ${provider}`);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "mcp", provider, payload, ts: new Date().toISOString() }),
      });
      const text = await res.text().catch(() => "");
      return { content: [{ type: "text", text: `Webhook ${provider} → ${res.status}\n${text.slice(0, 500)}` }] };
    },
  });

  mcp.tool({
    name: "search_workspace",
    description: "Full-text search across leads, deals, and tasks.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    handler: async ({ query }: { query: string }) => {
      const like = `%${query}%`;
      const [leads, deals, tasks] = await Promise.all([
        sb.from("leads").select("id,name,email,company").eq("company_id", ctx.companyId)
          .or(`name.ilike.${like},email.ilike.${like},company.ilike.${like}`).limit(10),
        sb.from("deals").select("id,title,value,stage").eq("company_id", ctx.companyId)
          .ilike("title", like).limit(10),
        sb.from("tasks").select("id,title,status").eq("company_id", ctx.companyId)
          .or(`title.ilike.${like},description.ilike.${like}`).limit(10),
      ]);
      return { content: [{ type: "text", text: JSON.stringify({
        leads: leads.data ?? [], deals: deals.data ?? [], tasks: tasks.data ?? [],
      }, null, 2) }] };
    },
  });

  return mcp;
}

const app = new Hono();

app.options("*", () => new Response(null, { headers: corsHeaders }));

app.all("/*", async (c) => {
  const ctx = await authenticate(c.req.raw);
  if (!ctx) {
    return new Response(JSON.stringify({ error: "Unauthorized — missing or invalid mcp_ token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const mcp = buildServer(ctx);
  const transport = new StreamableHttpTransport();
  const res = await transport.handleRequest(c.req.raw, mcp);
  // Merge CORS into transport response
  const headers = new Headers(res.headers);
  Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, { status: res.status, headers });
});

Deno.serve(app.fetch);
