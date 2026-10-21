-- P2 production observability. No secrets/tokens anywhere in this table or
-- the summary function below — only error messages/stack traces (already
-- user-facing or developer-facing text, never request payloads) and
-- aggregate counts.

CREATE TABLE public.client_error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid,
  message text NOT NULL,
  stack text,
  url text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_error_reports IS
  'Frontend ErrorBoundary crash reports. company_id/user_id are nullable because a render crash can happen before auth/profile finish loading.';

CREATE INDEX client_error_reports_created_idx ON public.client_error_reports (created_at DESC);
CREATE INDEX client_error_reports_company_idx ON public.client_error_reports (company_id, created_at DESC) WHERE company_id IS NOT NULL;

ALTER TABLE public.client_error_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (including a not-yet-authenticated session) can report a crash;
-- nobody can read anyone else's via the client — only via the admin
-- summary function below, which checks system_admin itself.
CREATE POLICY "Anyone can report a client error" ON public.client_error_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

REVOKE SELECT, UPDATE, DELETE ON public.client_error_reports FROM anon, authenticated;

-- Caps how much any single report can carry, independent of the client.
ALTER TABLE public.client_error_reports ADD CONSTRAINT client_error_reports_message_len CHECK (char_length(message) <= 2000);
ALTER TABLE public.client_error_reports ADD CONSTRAINT client_error_reports_stack_len CHECK (stack IS NULL OR char_length(stack) <= 8000);

-- One queryable place to answer "is anything broken right now", reusing
-- failure signals that already exist across the workflow queue, email
-- delivery, provider webhooks, and integration executions -- not a new
-- error-tracking system, a single read over the ones already built.
CREATE OR REPLACE FUNCTION public.get_system_health_summary(_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_system_health_summary(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_system_health_summary(integer) TO authenticated;
