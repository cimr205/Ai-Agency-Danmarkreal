import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { workflowActions } from "../_shared/workflowActionRegistry.ts";

interface ClaimedStep { id:string; company_id:string; workflow_run_id:string; step_type:string; idempotency_key:string; input:Record<string,unknown>; }

export async function drainDurableQueue(workerId: string, limit = 10) {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("claim_workflow_steps", { p_worker: workerId, p_limit: limit, p_lease_seconds: 120 });
  if (error) throw error;
  const results: Record<string, unknown>[] = [];
  for (const step of (data ?? []) as ClaimedStep[]) {
    const definition = workflowActions.get(step.step_type);
    if (!definition) {
      await db.rpc("finish_workflow_step", { p_step_id:step.id,p_worker:workerId,p_success:false,p_error:`Unsupported action: ${step.step_type}`,p_retryable:false });
      results.push({ step_id:step.id,status:"dead_letter",error:"unsupported_action" }); continue;
    }
    const validationError = definition.validate(step.input);
    if (validationError) {
      await db.rpc("finish_workflow_step", { p_step_id:step.id,p_worker:workerId,p_success:false,p_error:validationError,p_retryable:false });
      results.push({ step_id:step.id,status:"dead_letter",error:validationError }); continue;
    }
    const { data: run } = await db.from("workflow_runs").select("correlation_id").eq("id",step.workflow_run_id).eq("company_id",step.company_id).single();
    const { data: reservation, error: reserveError } = await db.rpc("reserve_workflow_side_effect", { p_step_id:step.id,p_worker:workerId,p_provider:step.step_type });
    if (reserveError) throw reserveError;
    if (!reservation?.can_execute) {
      await db.rpc("mark_workflow_step_attention", { p_step_id:step.id,p_worker:workerId,
        p_error:"Existing side-effect reservation has unknown outcome; manual review required" });
      results.push({ step_id:step.id,status:"needs_attention" }); continue;
    }
    try {
      const actionResult = await definition.execute(step.input,{ db,companyId:step.company_id,idempotencyKey:step.idempotency_key,correlationId:run?.correlation_id ?? step.workflow_run_id });
      await db.rpc("finish_workflow_step", { p_step_id:step.id,p_worker:workerId,p_success:true,p_output:actionResult.output,p_provider_reference:actionResult.providerReference ?? null });
      results.push({ step_id:step.id,status:"completed" });
    } catch (cause) {
      const typed = cause as Error & { retryable?: boolean; uncertain?: boolean };
      if (typed.uncertain === true || typed.retryable === undefined) {
        await db.rpc("mark_workflow_step_attention", { p_step_id:step.id,p_worker:workerId,p_error:typed.message });
        results.push({ step_id:step.id,status:"needs_attention",error:typed.message });
      } else {
        await db.rpc("finish_workflow_step", { p_step_id:step.id,p_worker:workerId,p_success:false,p_error:typed.message,p_retryable:typed.retryable === true });
        results.push({ step_id:step.id,status:typed.retryable ? "retry_scheduled" : "dead_letter",error:typed.message });
      }
    }
  }
  return { claimed:(data ?? []).length,results };
}
