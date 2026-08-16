-- Baseline: standard Supabase default role privileges on public schema
-- The raw-SQL schema-recon reconstruction (00-40 baseline files) captured table/constraint/index/
-- function/trigger/RLS-policy DDL but NOT the standard Supabase GRANT statements that every new
-- Supabase project applies by default. Without these, anon/authenticated roles have zero table
-- privileges regardless of RLS policies (RLS only restricts rows AFTER a GRANT already allows the
-- operation) - confirmed via a live REST API check that returned "permission denied for table
-- companies" (42501) even though RLS policies for companies existed and were correct.

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
