-- ORIGIN 003: least-privilege login role for the workflows (applied 2026-11-25).
-- No superuser, no BYPASSRLS: tenant RLS policies apply. The password is never stored in the repo;
-- it lives in the macOS keychain (service "origin-app-db-sunny-perception") and later in the n8n credential.
-- Every query must set the tenant first, e.g. SELECT set_config('app.tenant_id', $1, true).
-- Rollback: REVOKE ALL ON ALL TABLES IN SCHEMA public FROM origin_app; ... ; DROP ROLE origin_app;
CREATE ROLE origin_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT CONNECTION LIMIT 20 PASSWORD :'origin_app_password';
GRANT CONNECT ON DATABASE railway TO origin_app;
GRANT USAGE ON SCHEMA public TO origin_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO origin_app;
GRANT DELETE ON heartbeat_log TO origin_app;
REVOKE UPDATE ON audit_log FROM origin_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO origin_app;
GRANT EXECUTE ON FUNCTION prune_heartbeat_log(interval, boolean) TO origin_app;
