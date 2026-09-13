-- Security fix for a real bug introduced earlier in this same phase:
-- this project's baseline_default_grants migration runs
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon,
-- authenticated, service_role`, which grants EXECUTE directly to anon and
-- authenticated on every newly created function regardless of a later
-- `revoke ... from public` in the same migration (that only strips the
-- PUBLIC-role grant, not these separate direct per-role grants made at
-- creation time).
--
-- ingest_meta_lead (20260912000003_meta_lead_ads.sql) and
-- register_invoice_payment_service (20260912000005_stripe_invoice_payments.sql)
-- were both meant to be service_role-only — verified via
-- information_schema.routine_privileges that anon and authenticated both
-- still had EXECUTE despite the `revoke all ... from public` in those
-- migrations. That meant, until this fix:
-- - any authenticated user, or an unauthenticated (anon) caller, could call
--   ingest_meta_lead directly and inject fake leads/webhook events for any
--   company by guessing a page_id;
-- - any authenticated or anon caller could call
--   register_invoice_payment_service with an arbitrary p_company_id and
--   mark any company's invoice paid, with no authorization check at all
--   (the function trusts its caller completely, which is only safe when
--   restricted to service_role).
--
-- Revoking explicitly from both roles by name closes this, and does not
-- rely on the PUBLIC-role revoke.

revoke execute on function public.ingest_meta_lead(text, text, text, text, text, text, text, text, text, jsonb) from anon, authenticated;
revoke execute on function public.register_invoice_payment_service(uuid, uuid, numeric, text, text, text, jsonb) from anon, authenticated;

-- Same default-privileges cause, lower severity: update_deal_stage already
-- rejects unauthenticated callers internally (`auth.uid() is null` check),
-- so this is defense-in-depth rather than a fix for an exploitable gap —
-- anon should simply never have had EXECUTE on a user-scoped RPC.
revoke execute on function public.update_deal_stage(uuid, text) from anon;
