-- Reconstructed from live production (supabase_migrations.schema_migrations).
-- This migration was applied directly to the database and was missing from
-- git history until this audit found it via `supabase migration list --linked`.
-- Content is verbatim from the live `statements` column; not authored here.

-- Security fix: this project's baseline_default_grants migration runs
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon,
-- authenticated, service_role`, which grants EXECUTE directly to anon and
-- authenticated on every newly created function regardless of a later
-- `revoke ... from public` (that only strips the PUBLIC-role grant, not
-- these separate direct grants). ingest_meta_lead and
-- register_invoice_payment_service were meant to be service_role-only —
-- confirmed via information_schema.routine_privileges that anon and
-- authenticated both still had EXECUTE. Revoking explicitly from both
-- roles by name closes this.

revoke execute on function public.ingest_meta_lead(text, text, text, text, text, text, text, text, text, jsonb) from anon, authenticated;
revoke execute on function public.register_invoice_payment_service(uuid, uuid, numeric, text, text, text, jsonb) from anon, authenticated;
