-- ORIGIN 004: tenant security for the workflows (additive, reversible: 004_tenant_security.down.sql).
--
-- 1. Cross-tenant scheduler reads ("List tenants", "Find recoverable jobs") move into two SECURITY DEFINER
--    functions owned by origin_scheduler: a NOLOGIN role without superuser and without BYPASSRLS. RLS
--    policies scoped TO origin_scheduler give it exactly the rows and columns the two jobs need.
--    Only origin_app may execute them (EXECUTE is revoked from PUBLIC), and their input is validated.
-- 2. automation_errors gets the same forced tenant RLS as the other tenant tables.
-- 3. origin_app loses direct SELECT on tenants; it lists tenants only through the function.
-- Every tenant-scoped workflow query must first run:
--    SELECT 1 WHERE set_config('app.tenant_id', $tenant, true) IS NULL;
-- (returns no row, so it adds nothing to the node output; is_local=true so it ends with the statement's transaction).

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'origin_scheduler') THEN
    CREATE ROLE origin_scheduler NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO origin_scheduler;
GRANT SELECT (id, automation_enabled) ON tenants TO origin_scheduler;
GRANT SELECT (id, tenant_id, job_key, job_type, status, attempt_count, max_attempts, run_after, lease_expires_at, last_error),
      UPDATE (status, last_error, lease_owner, lease_expires_at, updated_at) ON jobs TO origin_scheduler;
GRANT INSERT (tenant_id, job_id, reason), SELECT (job_id, reason) ON notifications TO origin_scheduler; -- SELECT: needed by ON CONFLICT (job_id, reason)
GRANT USAGE ON SEQUENCE notifications_id_seq TO origin_scheduler;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'jobs' AND policyname = 'scheduler_maintenance') THEN
    CREATE POLICY scheduler_maintenance ON jobs FOR ALL TO origin_scheduler USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'scheduler_insert') THEN
    CREATE POLICY scheduler_insert ON notifications FOR INSERT TO origin_scheduler WITH CHECK (true);
  END IF;
END $$;

-- Tenants that have automation switched on. Returns ids only.
CREATE OR REPLACE FUNCTION origin_list_automation_tenants()
RETURNS TABLE (id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT t.id FROM tenants t WHERE t.automation_enabled ORDER BY t.id
$$;

-- Hourly recovery: dead-letters jobs whose attempts are exhausted, then returns at most p_limit
-- recovery jobs to resume. Returns (tenant_id, job_key) only; the payload is loaded per tenant under RLS.
CREATE OR REPLACE FUNCTION origin_find_recoverable_jobs(p_limit int DEFAULT 25)
RETURNS TABLE (tenant_id text, job_key text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 100';
  END IF;
  WITH dead AS (
    UPDATE jobs j SET status = 'dead',
      last_error = COALESCE(j.last_error || ' | ', '') || 'recovery: attempts exhausted after lease expiry',
      lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE j.attempt_count >= j.max_attempts
      AND ((j.status = 'running' AND j.lease_expires_at < now()) OR j.status IN ('failed', 'queued'))
    RETURNING j.id, j.tenant_id
  )
  INSERT INTO notifications (tenant_id, job_id, reason)
  SELECT d.tenant_id, d.id, 'Job ' || d.id::text || ' dead-lettered by recovery: attempts exhausted' FROM dead d
  ON CONFLICT (job_id, reason) DO NOTHING;

  RETURN QUERY
  SELECT j.tenant_id, j.job_key FROM jobs j JOIN tenants t ON t.id = j.tenant_id
  WHERE t.automation_enabled AND j.job_type = 'recovery' AND j.attempt_count < j.max_attempts
    AND ((j.status IN ('queued', 'failed') AND j.run_after <= now()) OR (j.status = 'running' AND j.lease_expires_at < now()))
  ORDER BY j.tenant_id, j.id LIMIT p_limit;
END $$;

ALTER FUNCTION origin_list_automation_tenants() OWNER TO origin_scheduler;
ALTER FUNCTION origin_find_recoverable_jobs(int) OWNER TO origin_scheduler;
REVOKE ALL ON FUNCTION origin_list_automation_tenants() FROM PUBLIC;
REVOKE ALL ON FUNCTION origin_find_recoverable_jobs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION origin_list_automation_tenants() TO origin_app;
GRANT EXECUTE ON FUNCTION origin_find_recoverable_jobs(int) TO origin_app;

-- automation_errors: tenant RLS like the other tenant tables (superuser connections are unaffected).
ALTER TABLE automation_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_errors FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automation_errors' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON automation_errors
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
END $$;

-- origin_app reads tenants only through origin_list_automation_tenants().
REVOKE SELECT, INSERT, UPDATE ON tenants FROM origin_app;

COMMIT;
