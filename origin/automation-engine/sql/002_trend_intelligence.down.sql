-- Rollback for 002_trend_intelligence.sql. Only removes what 002 created.
-- Destructive for data in these tables: run only with explicit approval.
BEGIN;
DROP TABLE IF EXISTS candidate_scores;
DROP TABLE IF EXISTS signal_snapshots;
DROP TABLE IF EXISTS trend_signals;
DROP TABLE IF EXISTS social_connections;
DROP TABLE IF EXISTS brands;
DROP TABLE IF EXISTS audit_log;
DROP FUNCTION IF EXISTS audit_log_append_only();
COMMIT;
