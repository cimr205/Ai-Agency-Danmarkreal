// Autopilot Agent — Lovable AI Gateway via Vercel AI SDK with operational tools
// across the entire workspace (CRM, Finance, Productivity, Webhook bridge).
import { Hono } from "npm:hono@4";
import {
  convertToModelMessages, streamText, tool, stepCountIs, type UIMessage,
} from "npm:ai@^6";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@^2";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = (Deno.env.get("AI_GATEWAY_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY"))!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const gateway = createOpenAICompatible({
  name: "lovable",
  baseURL: (Deno.env.get("AI_GATEWAY_BASE_URL") ?? "https://ai.gateway.lovable.dev/v1"),
  headers: {
    "Lovable-API-Key": LOVABLE_API_KEY,
    "X-Lovable-AIG-SDK": "vercel-ai-sdk",
  },
});

const SYSTEM = `You are the Autopilot — the operational AI brain inside a business OS that two people use to run a $100M company.

You have direct tools to read and act across CRM (leads, deals), Finance (invoices), Productivity (tasks), Communication (webhook bridge to Gmail/Slack/etc.), and the Event Bus.

Operating rules:
- Be decisive. Use tools immediately. Don't ask for confirmation unless an action is irreversible or sends external messages.
- For external sends (email, Slack, webhook), create an entry in autopilot_actions with status='proposed' and surface it for human approval — do NOT fire it directly.
- For internal CRM/finance/task updates, just do it and report back.
- When summarizing, be brief. Skip pleasantries. Use bullet points.
- After acting, always emit a workspace_event so the rest of the system reacts.
- Today is ${new Date().toISOString().slice(0, 10)}.`;

function buildSupabase(companyId: string, userId: string) {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
    global: { headers: { "x-autopilot-user": userId, "x-autopilot-company": companyId } },
  });
}

function buildTools(companyId: string, userId: string) {
  const sb = buildSupabase(companyId, userId);

  const emit = async (type: string, source: string, entityType: string | null, entityId: string | null, payload: Record<string, unknown>) => {
    await sb.rpc("emit_workspace_event", {
      _company_id: companyId, _type: type, _source: source,
      _entity_type: entityType, _entity_id: entityId, _payload: payload, _actor: userId,
    });
  };

  const propose = async (
    actionType: string, title: string, rationale: string, payload: Record<string, unknown>,
  ) => {
    const { data, error } = await sb.from("autopilot_actions").insert({
      company_id: companyId, user_id: userId,
      action_id: crypto.randomUUID(), action_type: actionType, category: "Autopilot",
      headline: title, status: "proposed",
      rationale, payload, suggested_by: "autopilot",
      execution_function: actionType, execution_payload: payload,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  };

  return {
    // ---- READ -----------------------------------------------------------
    list_leads: tool({
      description: "List leads from the CRM. Filter by status (new, contacted, qualified, won, lost) and limit.",
      inputSchema: z.object({ status: z.string().optional(), limit: z.number().default(20) }),
      execute: async ({ status, limit }) => {
        let q = sb.from("leads").select("id,name,email,company_name,status,score,value,next_followup_at")
          .eq("company_id", companyId).order("created_at", { ascending: false }).limit(Math.min(limit, 50));
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data;
      },
    }),
    list_deals: tool({
      description: "List deals from the pipeline. Filter by stage.",
      inputSchema: z.object({ stage: z.string().optional(), limit: z.number().default(20) }),
      execute: async ({ stage, limit }) => {
        let q = sb.from("deals").select("id,title,value,stage,expected_close_date,customer_id")
          .eq("company_id", companyId).order("created_at", { ascending: false }).limit(Math.min(limit, 50));
        if (stage) q = q.eq("stage", stage);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data;
      },
    }),
    list_overdue_invoices: tool({
      description: "List unpaid invoices past their due date.",
      inputSchema: z.object({}),
      execute: async () => {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await sb.from("invoices")
          .select("id,invoice_number,amount,due_date,customer_id,status")
          .eq("company_id", companyId).neq("status", "paid").lt("due_date", today).limit(50);
        if (error) throw new Error(error.message);
        return data;
      },
    }),
    list_tasks: tool({
      description: "List tasks. Filter by status (pending, in_progress, completed).",
      inputSchema: z.object({ status: z.string().optional(), limit: z.number().default(20) }),
      execute: async ({ status, limit }) => {
        let q = sb.from("tasks").select("id,title,status,priority,due_date,assigned_to,lead_id,deal_id")
          .eq("company_id", companyId).order("created_at", { ascending: false }).limit(Math.min(limit, 50));
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data;
      },
    }),
    list_recent_signals: tool({
      description: "Return the last N events from the workspace event bus across all modules.",
      inputSchema: z.object({ limit: z.number().default(15) }),
      execute: async ({ limit }) => {
        const { data, error } = await sb.from("workspace_events")
          .select("type,source_module,entity_type,entity_id,payload,created_at")
          .eq("company_id", companyId).order("created_at", { ascending: false }).limit(Math.min(limit, 50));
        if (error) throw new Error(error.message);
        return data;
      },
    }),
    list_integrations: tool({
      description: "List external services connected to the workspace via webhook bridge.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await sb.from("integrations")
          .select("provider,status,account_label,last_sync_at").eq("company_id", companyId);
        if (error) throw new Error(error.message);
        return data;
      },
    }),

    // ---- WRITE / INTERNAL ------------------------------------------------
    create_task: tool({
      description: "Create an internal task (no external send). Use freely.",
      inputSchema: z.object({
        title: z.string(), description: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        due_date: z.string().optional(), lead_id: z.string().optional(), deal_id: z.string().optional(),
      }),
      execute: async (i) => {
        const { data, error } = await sb.from("tasks").insert({
          company_id: companyId, created_by: userId,
          title: i.title, description: i.description, priority: i.priority,
          due_date: i.due_date, lead_id: i.lead_id, deal_id: i.deal_id, status: "pending",
        }).select().single();
        if (error) throw new Error(error.message);
        return { id: data.id, title: data.title };
      },
    }),
    update_lead_status: tool({
      description: "Update a lead's pipeline status.",
      inputSchema: z.object({ lead_id: z.string().uuid(), status: z.string() }),
      execute: async ({ lead_id, status }) => {
        const { error } = await sb.from("leads").update({ status })
          .eq("id", lead_id).eq("company_id", companyId);
        if (error) throw new Error(error.message);
        return { ok: true };
      },
    }),
    move_deal_stage: tool({
      description: "Move a deal to a new pipeline stage (discovery, proposal, negotiation, won, lost).",
      inputSchema: z.object({ deal_id: z.string().uuid(), stage: z.string() }),
      execute: async ({ deal_id, stage }) => {
        const { error } = await sb.from("deals").update({ stage })
          .eq("id", deal_id).eq("company_id", companyId);
        if (error) throw new Error(error.message);
        return { ok: true };
      },
    }),

    // ---- PROPOSE (require human approval) -------------------------------
    propose_email: tool({
      description: "Draft an email to send via the Gmail integration. Creates a proposed action for human approval; does NOT send.",
      inputSchema: z.object({
        to: z.string().email(), subject: z.string(), body: z.string(),
        related_entity_type: z.string().optional(), related_entity_id: z.string().optional(),
      }),
      execute: async (i) => {
        const id = await propose("send_email", `Email → ${i.to}: ${i.subject}`,
          `Foreslået send via Gmail-integration.`, i);
        return { proposed_action_id: id, status: "awaiting_approval" };
      },
    }),
    propose_webhook: tool({
      description: "Propose firing an external webhook integration (Slack, HubSpot, n8n, Zapier, etc.). Awaits human approval.",
      inputSchema: z.object({
        provider: z.string(), payload: z.record(z.string(), z.any()),
        purpose: z.string(),
      }),
      execute: async (i) => {
        const id = await propose("trigger_webhook", `Webhook → ${i.provider}`,
          i.purpose, i);
        return { proposed_action_id: id, status: "awaiting_approval" };
      },
    }),
    propose_invoice: tool({
      description: "Propose creating an invoice (draft). Awaits approval before becoming live.",
      inputSchema: z.object({
        customer_id: z.string().uuid(), amount: z.number(),
        due_date: z.string(), notes: z.string().optional(),
      }),
      execute: async (i) => {
        const id = await propose("create_invoice", `Faktura → ${i.amount} kr`,
          "Auto-genereret efter signal.", i);
        return { proposed_action_id: id, status: "awaiting_approval" };
      },
    }),

    // ---- EVENT BUS -------------------------------------------------------
    emit_event: tool({
      description: "Emit a custom event into the workspace event bus so other modules and subscriptions react.",
      inputSchema: z.object({
        type: z.string(), source: z.string().default("autopilot"),
        payload: z.record(z.string(), z.any()).default({}),
      }),
      execute: async ({ type, source, payload }) => {
        await emit(type, source, null, null, payload);
        return { ok: true };
      },
    }),
  };
}

const app = new Hono();
app.options("*", () => new Response(null, { headers: corsHeaders }));

app.post("/*", async (c) => {
  try {
    // Authenticate the caller — never trust client-supplied companyId/userId,
    // which would otherwise let anyone read and mutate any company's CRM data
    // through this agent (it runs with the service-role key, bypassing RLS).
    const authHeader = c.req.header("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: { user }, error: authErr } = await userClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "No company" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const companyId = profile.company_id as string;
    const userId = user.id;

    const body = await c.req.json();
    const messages = (body.messages ?? []) as UIMessage[];

    const tools = buildTools(companyId, userId);
    const result = streamText({
      model: gateway("google/gemini-3-flash-preview"),
      system: SYSTEM,
      tools,
      stopWhen: stepCountIs(50),
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse({ headers: corsHeaders });
  } catch (e) {
    console.error("autopilot-agent", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

Deno.serve(app.fetch);
