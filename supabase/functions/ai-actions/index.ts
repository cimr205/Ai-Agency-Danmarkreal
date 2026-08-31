// AI Action Layer — Lovable AI Gateway tool-calling agent.
// Connects ambient AI to real workspace data via tool calls scoped to the
// authenticated user's company. Destructive tools require `confirm: true`.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { getCompanyAI, AI_NOT_CONNECTED_MESSAGE } from "../_shared/aiConnection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ToolCall = { id: string; function: { name: string; arguments: string } };
type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: ToolCall[] };
type ToolArgs = {
  query?: string;
  title?: string;
  due_date?: string;
  priority?: string;
  customer_id?: string;
  value?: number;
  expected_close_date?: string;
  lead_id?: string;
  status?: string;
  workflow_id?: string;
  payload?: Record<string, unknown>;
};

const tools = [
  {
    type: "function",
    function: {
      name: "search_clients",
      description: "Search clients/customers by name or email.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a task. Non-destructive.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          due_date: { type: "string", description: "ISO date" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_deal",
      description: "Create a deal in the pipeline. Requires confirmation.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          customer_id: { type: "string" },
          value: { type: "number" },
          expected_close_date: { type: "string" },
        },
        required: ["title", "customer_id", "expected_close_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead_status",
      description: "Update a lead's status. Requires confirmation.",
      parameters: {
        type: "object",
        properties: { lead_id: { type: "string" }, status: { type: "string" } },
        required: ["lead_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trigger_workflow",
      description: "Trigger a saved workflow by id. Requires confirmation.",
      parameters: {
        type: "object",
        properties: { workflow_id: { type: "string" }, payload: { type: "object" } },
        required: ["workflow_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_integrations",
      description: "List which external systems are connected for this company.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const DESTRUCTIVE = new Set(["create_deal", "update_lead_status", "trigger_workflow"]);

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

    const { messages, confirm } = await req.json() as { messages: Msg[]; confirm?: boolean };

    const ai = await getCompanyAI(supabase, companyId);
    if (!ai) return json({ error: AI_NOT_CONNECTED_MESSAGE }, 400);

    const conversation: Msg[] = [
      {
        role: "system",
        content:
          "You are the operational intelligence layer of a business OS. " +
          "Use tools to act on the user's company data. Be concise. " +
          "If a destructive action is needed without confirmation, describe it and ask the user to confirm — do not call the tool.",
      },
      ...messages,
    ];

    const actions: Array<{ tool: string; input: ToolArgs; result: unknown; status: "ok" | "error"; error?: string }> = [];
    let reply = "";

    for (let step = 0; step < 6; step++) {
      const aiRes = await fetch(ai.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ai.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: ai.model, messages: conversation, tools, tool_choice: "auto" }),
      });

      if (aiRes.status === 429) return json({ error: "AI rate limited" }, 429);
      if (aiRes.status === 402) return json({ error: "AI credits exhausted" }, 402);
      if (!aiRes.ok) return json({ error: `AI error ${aiRes.status}` }, 500);

      const aiJson = await aiRes.json();
      const choice = aiJson.choices?.[0]?.message;
      if (!choice) break;

      conversation.push(choice);
      reply = choice.content ?? reply;

      const calls = choice.tool_calls as ToolCall[] | undefined;
      if (!calls?.length) break;

      for (const call of calls) {
        const name = call.function?.name;
        let args: ToolArgs = {};
        try { args = JSON.parse(call.function?.arguments ?? "{}"); } catch { /* noop */ }

        if (DESTRUCTIVE.has(name) && !confirm) {
          actions.push({ tool: name, input: args, result: null, status: "error", error: "needs_confirmation" });
          conversation.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: "needs_confirmation" }),
          });
          continue;
        }

        const result = await execTool(name, args, supabase, companyId, user.id);
        actions.push({ tool: name, input: args, result: result.ok ? result.data : null, status: result.ok ? "ok" : "error", error: result.ok ? undefined : result.error });
        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result.ok ? result.data : { error: result.error }),
        });

        // log
        await supabase.from("activity_logs").insert({
          user_id: user.id,
          company_id: companyId,
          action_type: "ai_action",
          entity_type: "ai_action",
          description: `AI udførte ${name}`,
          metadata: { tool: name, input: args, status: result.ok ? "ok" : "error" },
        });
      }
    }

    return json({ reply, actions });
  } catch (e) {
    console.error("ai-actions error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});

async function execTool(
  name: string,
  args: ToolArgs,
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case "search_clients": {
        const q = String(args.query ?? "").trim();
        if (!q) return { ok: true, data: [] };
        const { data, error } = await supabase
          .from("customers")
          .select("id,name,email,phone")
          .eq("company_id", companyId)
          .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(8);
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }
      case "create_task": {
        const { data, error } = await supabase.from("tasks").insert({
          company_id: companyId,
          created_by: userId,
          title: args.title,
          due_date: args.due_date ?? null,
          priority: args.priority ?? "medium",
          status: "todo",
        }).select("id,title").maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }
      case "create_deal": {
        const { data, error } = await supabase.from("deals").insert({
          company_id: companyId,
          created_by: userId,
          title: args.title,
          customer_id: args.customer_id,
          value: args.value ?? 0,
          expected_close_date: args.expected_close_date,
          stage: "qualification",
        }).select("id,title").maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }
      case "update_lead_status": {
        const { data, error } = await supabase.from("customers")
          .update({ status: args.status })
          .eq("id", args.lead_id)
          .eq("company_id", companyId)
          .eq("record_type", "lead")
          .select("id,status").maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }
      case "trigger_workflow": {
        const res = await supabase.functions.invoke("workflow-runner", {
          body: { workflow_id: args.workflow_id, payload: args.payload ?? {}, mode: "live" },
        });
        if (res.error) return { ok: false, error: res.error.message };
        return { ok: true, data: res.data };
      }
      case "list_integrations": {
        const { data, error } = await supabase
          .from("integrations").select("provider,status,account_label,last_sync_at")
          .eq("company_id", companyId);
        if (error) return { ok: false, error: error.message };
        return { ok: true, data };
      }
      default:
        return { ok: false, error: `unknown_tool:${name}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "exec_failed" };
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
