-- Security audit finding L-05: tenant isolation currently rests entirely on
-- RLS with client-supplied company_id filters (confirmed working by manual
-- black-box testing, but not covered by any automated regression test).
-- Enables pgTAP so supabase/tests/database/*.sql can assert cross-tenant
-- read/write isolation per table and catch a future RLS regression in CI.
create extension if not exists pgtap with schema extensions;
