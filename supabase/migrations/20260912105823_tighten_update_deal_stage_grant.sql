-- Reconstructed from live production (supabase_migrations.schema_migrations).
-- This migration was applied directly to the database and was missing from
-- git history until this audit found it via `supabase migration list --linked`.
-- Content is verbatim from the live `statements` column; not authored here.

-- update_deal_stage already rejects unauthenticated callers internally
-- (`if auth.uid() is null ... raise exception 'Not authorized'`), so this is
-- defense-in-depth, not a fix for an exploitable gap: anon should never
-- have had EXECUTE in the first place, for the same default-privileges
-- reason documented in 20260912000006_fix_service_only_function_grants.sql.
revoke execute on function public.update_deal_stage(uuid, text) from anon;
