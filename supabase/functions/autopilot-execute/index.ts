import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
    if (!profile?.company_id) throw new Error("No company");

    const { action, status } = await req.json();
    // action: { id, action_type, category, entity_id, entity_type, headline, execution_function, execution_payload }
    // status: "approved" | "skipped"

    // Log the action
    await supabase.from("autopilot_actions").insert({
      company_id: profile.company_id,
      user_id: user.id,
      action_id: action.id,
      action_type: action.execution_function || action.id,
      category: action.category,
      entity_id: action.execution_payload?.deal_id || action.execution_payload?.invoice_id || action.execution_payload?.lead_id || action.execution_payload?.employee_id || null,
      entity_type: action.category,
      headline: action.headline,
      status,
      execution_function: action.execution_function,
      execution_payload: action.execution_payload,
      executed_at: status === "approved" ? new Date().toISOString() : null,
    });

    let result: { success: boolean; message: string } = { success: true, message: "Action logged" };

    // Execute if approved
    if (status === "approved" && action.execution_function) {
      const fn = action.execution_function;
      const payload = action.execution_payload || {};

      try {
        if (fn === "send_deal_followup_email" || fn === "send_followup_email") {
          // Send email via gmail-send
          const emailResp = await fetch(`${supabaseUrl}/functions/v1/gmail-send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
            body: JSON.stringify({ to: payload.to, subject: payload.subject, message: payload.message }),
          });
          const emailData = await emailResp.json();
          result = { success: emailResp.ok, message: emailResp.ok ? "Email sendt" : emailData.error || "Email fejl" };
        } else if (fn === "update_deal_stage") {
          await supabase.from("deals").update({ stage: payload.stage, notes: payload.notes }).eq("id", payload.deal_id);
          result = { success: true, message: "Deal opdateret" };
        } else if (fn === "create_task" || fn === "create_followup_task") {
          await supabase.from("tasks").insert({
            company_id: profile.company_id,
            created_by: user.id,
            title: payload.title || action.headline,
            description: payload.description || action.context,
            priority: payload.priority || "high",
            status: "todo",
          });
          result = { success: true, message: "Opgave oprettet" };
        } else if (fn === "send_invoice_reminder") {
          // Create a task for invoice follow-up
          await supabase.from("tasks").insert({
            company_id: profile.company_id,
            created_by: user.id,
            title: `Rykker: ${payload.invoice_number || "Faktura"}`,
            description: `Send påmindelse til ${payload.customer_name} for faktura ${payload.invoice_number} — ${payload.amount} kr. overdue`,
            priority: "high",
            status: "todo",
          });
          result = { success: true, message: "Rykkerpåmindelse oprettet" };
        } else if (fn === "create_hr_overtime_alert" || fn === "flag_hr_issue") {
          await supabase.from("tasks").insert({
            company_id: profile.company_id,
            created_by: user.id,
            title: payload.title || `HR Alert: ${action.headline}`,
            description: payload.description || action.context,
            priority: "high",
            status: "todo",
          });
          result = { success: true, message: "HR-alert oprettet" };
        } else if (fn === "contact_lead") {
          await supabase.from("customers").update({ status: "contacted", last_touched_at: new Date().toISOString() }).eq("id", payload.lead_id).eq("record_type", "lead");
          result = { success: true, message: "Lead markeret som kontaktet" };
        } else {
          // Generic: create a task for the action
          await supabase.from("tasks").insert({
            company_id: profile.company_id,
            created_by: user.id,
            title: action.headline,
            description: `${action.context}\n\nAnbefalet handling: ${action.recommended_action}`,
            priority: "high",
            status: "todo",
          });
          result = { success: true, message: "Opgave oprettet fra handling" };
        }
      } catch (execErr) {
        console.error("Execution error:", execErr);
        result = { success: false, message: (execErr as Error).message };
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Autopilot execute error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
