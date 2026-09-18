-- public.leads was superseded by public.customers (record_type='lead') in
-- 20260824000001_merge_leads_into_customers_schema.sql — dependent foreign
-- keys were repointed away from it in 20260824000004, and no code path in
-- the frontend or edge functions writes to it any longer (one unused,
-- unimported hook still reads it: src/hooks/useLeadsPaginated.ts).
--
-- The table itself was never locked down after the migration, so a future
-- write to it — accidental or otherwise — would silently recreate a second,
-- disconnected system of record for the exact entity this schema already
-- had to fix once. Freezing it to read-only removes that risk without
-- touching the historical data or the (currently harmless) RLS policies.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.leads FROM authenticated;
REVOKE ALL ON public.leads FROM anon;
