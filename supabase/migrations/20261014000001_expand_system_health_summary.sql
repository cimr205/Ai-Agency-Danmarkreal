-- P12: expand the system health summary with signals the user explicitly
-- asked for that have a reliable data source today: stuck workflows,
-- queue depth, oldest queued job, and failed payment events.
--
-- Deliberately NOT added (no reliable signal exists yet, rather than
-- fabricating one):
--   - "authentication anomalies" — auth.audit_log_entries exists but is
--     empty in this project; not a signal we can build on honestly today.
--   - raw Edge Function runtime failures — nothing in this architecture
--     logs a generic "function threw" event; the closest real proxies
--     (provider_webhook_failures, integration_execution_failures) were
--     already present before this change.

CREATE OR REPLACE FUNCTION public.get_system_health_summary(_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_is_system_admin boolean;
  v_result jsonb;
  v_since timestamptz := now() - (_hours || ' hours')::interval;
BEGIN
  v_is_system_admin := has_role(auth.uid(), 'system_admin'::app_role);
  v_company_id := get_user_company_id(auth.uid());

  IF NOT v_is_system_admin AND NOT is_company_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'since', v_since,
    'scope', CASE WHEN v_is_system_admin THEN 'all_companies' ELSE 'own_company' END,
    'client_errors', (
      SELECT count(*) FROM public.client_error_reports
      WHERE created_at >= v_since AND (v_is_system_admin OR company_id = v_company_id)
    ),
    'workflow_steps_needing_attention', (
      SELECT count(*) FROM public.workflow_step_runs
      WHERE created_at >= v_since AND status = 'needs_attention'
        AND (v_is_system_admin OR company_id = v_company_id)
    ),
    'workflow_steps_dead_lettered', (
      SELECT count(*) FROM public.workflow_step_runs
      WHERE created_at >= v_since AND status = 'dead_letter'
        AND (v_is_system_admin OR company_id = v_company_id)
    ),
    'workflow_runs_stuck', (
      -- queued/running for over an hour: either the drain cron isn't
      -- keeping up, or a worker crashed mid-step without releasing its lease.
      SELECT count(*) FROM public.workflow_runs
      WHERE status IN ('queued', 'running') AND created_at < now() - interval '1 hour'
        AND (v_is_system_admin OR company_id = v_company_id)
    ),
    'workflow_queue_depth', (
      SELECT count(*) FROM public.workflow_step_runs
      WHERE status IN ('pending', 'running', 'waiting')
        AND (v_is_system_admin OR company_id = v_company_id)
    ),
    'workflow_queue_oldest_pending_at', (
      SELECT min(created_at) FROM public.workflow_step_runs
      WHERE status = 'pending'
        AND (v_is_system_admin OR company_id = v_company_id)
    ),
    'email_send_failures', (
      -- email_send_log has no company_id (it's provider-queue-level
      -- infrastructure, not tenant-scoped) -- only visible to system_admin.
      SELECT CASE WHEN v_is_system_admin THEN count(*) ELSE NULL END
      FROM public.email_send_log
      WHERE created_at >= v_since AND status = 'failed'
    ),
    'provider_webhook_failures', (
      SELECT count(*) FROM public.provider_webhook_receipts
      WHERE received_at >= v_since AND status = 'failed'
        AND (v_is_system_admin OR company_id = v_company_id)
    ),
    'integration_execution_failures', (
      SELECT count(*) FROM public.integration_execution_logs
      WHERE started_at >= v_since AND status = 'failed'
        AND (v_is_system_admin OR company_id = v_company_id)
    ),
    'payments_failed', (
      SELECT count(*) FROM public.payments
      WHERE created_at >= v_since AND status = 'failed'
        AND (v_is_system_admin OR company_id = v_company_id)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
