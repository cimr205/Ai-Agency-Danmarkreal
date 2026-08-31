import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { getCompanyAI, AI_NOT_CONNECTED_MESSAGE } from "../_shared/aiConnection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_EVENTS = [
  "lead.created", "lead.updated",
  "deal.created", "deal.won", "deal.lost",
  "task.created", "task.completed",
  "employee.created", "employee.clocked_in", "employee.clocked_out",
  "invoice.created", "invoice.paid",
  "email.sent", "email.opened",
];

const VALID_ACTIONS = ["send_webhook", "create_task", "update_lead", "send_notification", "run_integration"];

// A small, hand-verified catalog of real tool calls a "run_integration"
// workflow action can perform — verified live against Composio's actual
// tool schemas, not guessed. Extend this list (never invent a toolSlug
// outside it) as more write-capable providers get connected and vetted.
// The same capability→connection resolution as Calendar/Documents runs
// server-side in workflow-runner; this catalog only fixes which
// capability+tool pairs are safe to expose to the AI chat builder.
const ACTION_CATALOG = [
  {
    capability: "documents.write",
    label: "Opret en Notion-side",
    toolSlug: "NOTION_CREATE_NOTION_PAGE",
    requiredArgs: ["parent_id", "title"],
    argHelp: "parent_id = UUID'en for den Notion-side eller -database den nye side skal oprettes under (findes i URL'en til siden i Notion). title må gerne indeholde {{felt}}-pladsholdere fra trigger-dataen.",
  },
];

const EVENT_LABELS: Record<string, string> = {
  "lead.created": "et nyt lead bliver oprettet",
  "lead.updated": "et lead bliver opdateret",
  "deal.created": "en ny deal bliver oprettet",
  "deal.won": "en deal bliver vundet",
  "deal.lost": "en deal bliver tabt",
  "task.created": "en ny opgave bliver oprettet",
  "task.completed": "en opgave bliver færdiggjort",
  "employee.created": "en ny medarbejder bliver oprettet",
  "employee.clocked_in": "en medarbejder clocker ind",
  "employee.clocked_out": "en medarbejder clocker ud",
  "invoice.created": "en ny faktura bliver oprettet",
  "invoice.paid": "en faktura bliver betalt",
  "email.sent": "en email bliver sendt",
  "email.opened": "en email bliver åbnet",
};

const tools = [
  {
    type: "function",
    function: {
      name: "create_workflow",
      description: "Opret et nyt workflow/automation baseret på brugerens ønske. Kald dette når brugeren vil automatisere noget.",
      parameters: {
        type: "object",
        properties: {
          trigger_event: {
            type: "string",
            enum: VALID_EVENTS,
            description: "Den event der trigger workflowet",
          },
          action_type: {
            type: "string",
            enum: VALID_ACTIONS,
            description: "Hvad der skal ske (send_webhook for Zapier/Make, run_integration for at køre en handling gennem en rigtig forbundet konto som Notion)",
          },
          webhook_url: {
            type: "string",
            description: "Webhook URL (fra Zapier/Make). Sæt til tom streng hvis URL mangler.",
          },
          action_capability: {
            type: "string",
            description: "Kun for run_integration: capability-navnet fra kataloget, fx 'documents.write'.",
          },
          action_tool_slug: {
            type: "string",
            description: "Kun for run_integration: det præcise toolSlug fra kataloget, fx 'NOTION_CREATE_NOTION_PAGE'. Opfind aldrig et slug der ikke står i kataloget.",
          },
          action_arguments: {
            type: "object",
            description: "Kun for run_integration: argumenterne til værktøjet, fx { parent_id: '...', title: 'Ny sag: {{name}}' }.",
          },
          payload_fields: {
            type: "array",
            items: { type: "string" },
            description: "Hvilke data-felter der skal sendes, fx ['name','email','company_name']",
          },
          description: {
            type: "string",
            description: "Menneskeligt læsbar beskrivelse af workflowet",
          },
        },
        required: ["trigger_event", "action_type", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_workflows",
      description: "Vis brugerens eksisterende workflows.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_workflow",
      description: "Aktivér eller deaktivér et workflow.",
      parameters: {
        type: "object",
        properties: {
          workflow_id: { type: "string", description: "ID på workflowet" },
          is_active: { type: "boolean", description: "true = aktiv, false = deaktiveret" },
        },
        required: ["workflow_id", "is_active"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_workflow",
      description: "Slet et workflow permanent.",
      parameters: {
        type: "object",
        properties: {
          workflow_id: { type: "string", description: "ID på workflowet" },
        },
        required: ["workflow_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "test_workflow",
      description: "Test et workflow ved at sende test-data til webhooken.",
      parameters: {
        type: "object",
        properties: {
          workflow_id: { type: "string", description: "ID på workflowet der skal testes" },
        },
        required: ["workflow_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_workflows",
      description: "Foreslå relevante workflows baseret på brugerens platform-brug.",
      parameters: { type: "object", properties: {} },
    },
  },
];

interface ToolArgs {
  trigger_event?: string;
  action_type?: string;
  webhook_url?: string;
  action_capability?: string;
  action_tool_slug?: string;
  action_arguments?: Record<string, unknown>;
  payload_fields?: string[];
  description?: string;
  workflow_id?: string;
  is_active?: boolean;
}

async function executeTool(
  toolName: string,
  args: ToolArgs,
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<{ success: boolean; result: string }> {
  try {
    switch (toolName) {
      case "create_workflow": {
        const { trigger_event, action_type, webhook_url, action_capability, action_tool_slug, action_arguments, payload_fields, description } = args;
        if (!trigger_event || !VALID_EVENTS.includes(trigger_event)) {
          return { success: false, result: `Ugyldig trigger: ${trigger_event}` };
        }
        const needsUrl = action_type === "send_webhook" && (!webhook_url || webhook_url.trim() === "");
        if (needsUrl) {
          return {
            success: false,
            result: `NEEDS_WEBHOOK_URL|${trigger_event}|${action_type}|${JSON.stringify(payload_fields || [])}|${description}`,
          };
        }
        if (action_type === "run_integration") {
          const catalogEntry = ACTION_CATALOG.find((c) => c.capability === action_capability && c.toolSlug === action_tool_slug);
          if (!catalogEntry) {
            return { success: false, result: `Ukendt handling. Vælg en fra kataloget: ${ACTION_CATALOG.map((c) => `${c.label} (${c.capability} → ${c.toolSlug})`).join(", ")}` };
          }
          const missing = catalogEntry.requiredArgs.filter((a) => !action_arguments || action_arguments[a] === undefined || action_arguments[a] === "");
          if (missing.length > 0) {
            return { success: false, result: `Mangler felter til "${catalogEntry.label}": ${missing.join(", ")}. ${catalogEntry.argHelp}` };
          }
        }
        const { data, error } = await supabase.from("workflows").insert({
          company_id: companyId,
          created_by: userId,
          trigger_event,
          action_type,
          webhook_url: webhook_url || null,
          action_capability: action_type === "run_integration" ? action_capability : null,
          action_tool_slug: action_type === "run_integration" ? action_tool_slug : null,
          action_arguments: action_type === "run_integration" ? (action_arguments ?? {}) : {},
          payload_fields: payload_fields || [],
          description,
          is_active: true,
        }).select("id").single();
        if (error) return { success: false, result: `Fejl: ${error.message}` };
        // Also create corresponding webhook entry for integration
        if (action_type === "send_webhook" && webhook_url) {
          await supabase.from("webhooks").insert({
            company_id: companyId,
            name: description || `Workflow: ${trigger_event}`,
            url: webhook_url,
            event: trigger_event,
            is_active: true,
          });
        }
        const actionLabel = action_type === "send_webhook"
          ? "Send data til webhook"
          : action_type === "run_integration"
          ? ACTION_CATALOG.find((c) => c.toolSlug === action_tool_slug)?.label ?? action_tool_slug
          : action_type;
        return {
          success: true,
          result: `✅ **Workflow oprettet!**\n\n📋 **Trigger:** Når ${EVENT_LABELS[trigger_event] || trigger_event}\n⚡ **Handling:** ${actionLabel}\n${webhook_url ? `🔗 **URL:** ${webhook_url}\n` : ""}${payload_fields?.length ? `📦 **Data:** ${payload_fields.join(", ")}\n` : ""}✅ **Status:** Aktiv\n🆔 **ID:** ${data.id}`,
        };
      }

      case "list_workflows": {
        const { data, error } = await supabase
          .from("workflows")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });
        if (error) return { success: false, result: `Fejl: ${error.message}` };
        if (!data?.length) return { success: true, result: "Du har ingen workflows endnu. Skriv hvad du gerne vil automatisere, så opretter jeg det for dig! 🚀" };
        interface WorkflowRow {
          id: string;
          is_active: boolean;
          description: string | null;
          trigger_event: string;
          action_type: string;
          run_count: number;
        }
        const list = (data as WorkflowRow[]).map((w, i: number) =>
          `${i + 1}. ${w.is_active ? "🟢" : "🔴"} **${w.description || w.trigger_event}**\n   Trigger: ${EVENT_LABELS[w.trigger_event] || w.trigger_event}\n   Handling: ${w.action_type}\n   Kørsler: ${w.run_count} | ID: \`${w.id}\``
        ).join("\n\n");
        return { success: true, result: `📋 **Dine workflows (${data.length}):**\n\n${list}` };
      }

      case "toggle_workflow": {
        const { workflow_id, is_active } = args;
        const { error } = await supabase.from("workflows")
          .update({ is_active })
          .eq("id", workflow_id)
          .eq("company_id", companyId);
        if (error) return { success: false, result: `Fejl: ${error.message}` };
        return { success: true, result: `✅ Workflow er nu **${is_active ? "aktiveret" : "deaktiveret"}**.` };
      }

      case "delete_workflow": {
        const { workflow_id } = args;
        const { error } = await supabase.from("workflows")
          .delete()
          .eq("id", workflow_id)
          .eq("company_id", companyId);
        if (error) return { success: false, result: `Fejl: ${error.message}` };
        return { success: true, result: "✅ Workflow slettet." };
      }

      case "test_workflow": {
        const { workflow_id } = args;
        const { data: wf, error } = await supabase
          .from("workflows")
          .select("*")
          .eq("id", workflow_id)
          .eq("company_id", companyId)
          .single();
        if (error || !wf) return { success: false, result: "Workflow ikke fundet." };
        if (wf.action_type === "run_integration") {
          return { success: true, result: "Dette workflow kører en handling gennem en forbundet konto — test det fra Workflow Studio's 'Kør test'-knap, hvor du kan se hele kæden (trigger → AI → handling) trin for trin." };
        }
        if (!wf.webhook_url) return { success: false, result: "Workflowet har ingen webhook URL – kan ikke testes." };
        const testPayload = {
          event: wf.trigger_event,
          timestamp: new Date().toISOString(),
          tenant_id: companyId,
          _test: true,
          data: Object.fromEntries((wf.payload_fields || ["name", "email"]).map((f: string) => [f, `test_${f}`])),
        };
        try {
          const resp = await fetch(wf.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(testPayload),
            signal: AbortSignal.timeout(8000),
          });
          await supabase.from("workflows").update({
            last_run_at: new Date().toISOString(),
            run_count: (wf.run_count || 0) + 1,
            last_error: resp.ok ? null : `HTTP ${resp.status}`,
          }).eq("id", workflow_id);
          if (resp.ok) {
            return { success: true, result: `✅ **Test lykkedes!**\n\nWebhook svarede med HTTP ${resp.status}.\nData sendt: ${JSON.stringify(testPayload.data, null, 2)}` };
          }
          return { success: false, result: `⚠️ Webhook svarede med HTTP ${resp.status}. Tjek din Zapier/Make URL.` };
        } catch (e) {
          await supabase.from("workflows").update({ last_error: e.message }).eq("id", workflow_id);
          return { success: false, result: `❌ Test fejlede: ${e.message}` };
        }
      }

      case "suggest_workflows": {
        // Get counts of key entities to make suggestions relevant
        const [leads, deals, tasks, employees] = await Promise.all([
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("company_id", companyId),
          supabase.from("deals").select("id", { count: "exact", head: true }).eq("company_id", companyId),
          supabase.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", companyId),
          supabase.from("employee_profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        ]);
        const suggestions: string[] = [];
        if ((leads.count || 0) > 0) {
          suggestions.push("📥 **Nye leads → Zapier**: Send automatisk nye leads til Google Sheets, Slack eller dit CRM");
          suggestions.push("📧 **Lead opfølgning**: Få besked når et lead ændrer status");
        }
        if ((deals.count || 0) > 0) {
          suggestions.push("🏆 **Deal vundet → Fejring**: Send Slack-besked når en deal vindes");
          suggestions.push("📊 **Deal tracking**: Send deal-data til Google Sheets for rapportering");
        }
        if ((employees.count || 0) > 0) {
          suggestions.push("⏰ **Clock in/out → Tidsregistrering**: Send fremmøde-data til eksternt system");
          suggestions.push("👋 **Ny medarbejder → Onboarding**: Trigger onboarding-flow i Zapier");
        }
        if ((tasks.count || 0) > 0) {
          suggestions.push("✅ **Opgave færdig → Notifikation**: Få besked når opgaver afsluttes");
        }
        suggestions.push("💰 **Faktura betalt → Regnskab**: Send betalingsdata til dit regnskabssystem");
        suggestions.push("📬 **Email åbnet → Opfølgning**: Automatisk follow-up når emails åbnes");
        return {
          success: true,
          result: `🤖 **Smarte forslag til dig:**\n\n${suggestions.join("\n\n")}\n\n💡 Skriv fx *"Når en deal bliver vundet, send det til Zapier"* for at oprette et workflow.`,
        };
      }

      default:
        return { success: false, result: `Ukendt tool: ${toolName}` };
    }
  } catch (e) {
    return { success: false, result: `Fejl: ${e.message}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Ikke autentificeret" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: "Ingen virksomhed tilknyttet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ai = await getCompanyAI(supabase, profile.company_id);
    if (!ai) {
      return new Response(JSON.stringify({ error: AI_NOT_CONNECTED_MESSAGE }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Du er en venlig AI automation-assistent i et dansk SaaS-system.

Din opgave er at hjælpe brugere med at oprette, styre og forstå workflows/automatiseringer.

DU KAN:
- Oprette workflows der sender data til Zapier/Make via webhooks
- Vise eksisterende workflows
- Aktivere/deaktivere workflows
- Teste workflows
- Foreslå smarte automatiseringer baseret på brugerens data
- Slette workflows

TRIGGERS DU FORSTÅR:
${VALID_EVENTS.map(e => `- ${e}: Når ${EVENT_LABELS[e]}`).join("\n")}

HANDLINGER:
- send_webhook: Send data til en Zapier/Make webhook URL
- run_integration: Kør en ægte handling gennem en konto brugeren allerede har forbundet under Forbundne apps — ikke en webhook, en rigtig handling i det andet system. Kun disse er understøttet lige nu:
${ACTION_CATALOG.map((c) => `  - ${c.label}: capability="${c.capability}", toolSlug="${c.toolSlug}". ${c.argHelp}`).join("\n")}
- create_task / update_lead / send_notification: endnu ikke understøttet af selve kørslen — opret dem ikke, sig at de er på vej

VIGTIGT:
- Svar altid på dansk
- Hold svarene korte og venlige
- Hvis brugeren nævner "Zapier", "Make", "Slack (via webhook)", "Google Sheets" osv. uden at have forbundet en konto, brug send_webhook
- Hvis brugeren beder om en handling der matcher et af run_integration-kataloget ovenfor (fx "opret en Notion-side når..."), brug run_integration — spørg om de manglende felter (fx Notion parent_id) hvis de ikke er givet, opfind dem aldrig
- Brug ALDRIG et toolSlug eller capability der ikke står i kataloget ovenfor — sig i stedet ærligt at den handling ikke er understøttet endnu
- Hvis der mangler en webhook URL, brug create_workflow med tom webhook_url – systemet vil bede om URL
- Foreslå automatisk relevante workflows når det giver mening
- Brug markdown til pæn formatering
- Vær proaktiv: spørg om brugeren vil teste workflowet efter oprettelse`;

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // AI call with tool support
    let response = await fetch(ai.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ai.model,
        messages: aiMessages,
        tools,
        stream: false,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const t = await response.text();
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit nået. Prøv igen om lidt." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI-kreditter opbrugt." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI error:", status, t);
      return new Response(JSON.stringify({ error: "AI fejl" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let aiResult = await response.json();
    let choice = aiResult.choices?.[0];

    // Handle tool calls in a loop (max 5 iterations)
    let iterations = 0;
    while (choice?.message?.tool_calls?.length && iterations < 5) {
      iterations++;
      const toolResults: Array<{ role: "tool"; tool_call_id: string; content: string }> = [];
      for (const tc of choice.message.tool_calls) {
        const toolArgs = typeof tc.function.arguments === "string"
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;
        const result = await executeTool(tc.function.name, toolArgs, supabase, user.id, profile.company_id);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result.result,
        });
      }
      aiMessages.push(choice.message);
      aiMessages.push(...toolResults);

      response = await fetch(ai.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ai.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ai.model,
          messages: aiMessages,
          tools,
          stream: false,
        }),
      });

      if (!response.ok) break;
      aiResult = await response.json();
      choice = aiResult.choices?.[0];
    }

    const reply = choice?.message?.content || "Beklager, jeg kunne ikke forstå din besked. Prøv at omformulere.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("workflow-assistant error:", e);
    return new Response(JSON.stringify({ error: e.message || "Ukendt fejl" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
