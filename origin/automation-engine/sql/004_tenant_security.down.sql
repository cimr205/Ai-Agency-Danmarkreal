-- Rollback for 004_tenant_security.sql. Removes only what 004 added and restores origin_app's tenants grant.
-- No table or row is dropped.
BEGIN;
DROP FUNCTION IF EXISTS origin_find_recoverable_jobs(int);
DROP FUNCTION IF EXISTS origin_list_automation_tenants();
DROP POLICY IF EXISTS scheduler_maintenance ON jobs;
DROP POLICY IF EXISTS scheduler_insert ON notifications;
DROP POLICY IF EXISTS tenant_isolation ON automation_errors;
ALTER TABLE automation_errors NO FORCE ROW LEVEL SECURITY;
ALTER TABLE automation_errors DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON tenants, jobs, notifications FROM origin_scheduler;
REVOKE ALL ON SEQUENCE notifications_id_seq FROM origin_scheduler;
REVOKE USAGE ON SCHEMA public FROM origin_scheduler;
DROP ROLE IF EXISTS origin_scheduler;
GRANT SELECT, INSERT, UPDATE ON tenants TO origin_app;
COMMIT;
