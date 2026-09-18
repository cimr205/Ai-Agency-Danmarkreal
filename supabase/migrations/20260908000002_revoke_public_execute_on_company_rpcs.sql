-- Follow-up to 20260908000001: `REVOKE EXECUTE ... FROM anon, authenticated`
-- does not remove access granted via the implicit `PUBLIC` pseudo-role that
-- Postgres grants EXECUTE to by default at function-creation time. Since
-- every role (including anon) is implicitly a member of PUBLIC, the prior
-- migration's revoke had no practical effect -- confirmed live via
-- has_function_privilege('anon', ..., 'EXECUTE') still returning true after
-- applying it. Revoking from PUBLIC explicitly, then re-granting only to
-- the roles that should have access, closes the gap for real.

REVOKE EXECUTE ON FUNCTION public.activate_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_company(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_usage_quota(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_usage_quota(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_usage_quota(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_usage_quota(uuid, text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_company_safe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_safe(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_company_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_status(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_company_mode(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_company_mode(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_compliance_item(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_compliance_item(uuid, text, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_active_webhooks_for_event(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_webhooks_for_event(uuid, text) TO service_role;
