-- SECURITY FIX (audit finding, 2026-09-08): nine SECURITY DEFINER functions
-- in the public schema accepted a `_company_id` argument without fully
-- verifying it matched the authenticated caller's own company (confirmed
-- via `supabase db advisors --type security`). Live inspection showed
-- `set_company_mode` and `update_compliance_item` had already been
-- hotfixed directly against production (their live definitions already
-- carry the ownership check below) without a corresponding migration ever
-- being committed — this migration codifies that drift and applies the
-- same ownership check to the remaining seven functions:
-- activate_company, check_usage_quota, increment_usage_quota,
-- generate_invoice_number, get_company_safe, get_company_status, and
-- get_active_webhooks_for_event. The last of these is only ever called by
-- the webhook-dispatch edge function using the service-role key, so it is
-- restricted to service_role rather than given an ownership check.
-- check_usage_quota, increment_usage_quota, and get_company_safe have no
-- callers anywhere in this repo (grep confirmed) and are hardened as
-- defense in depth rather than removed, since usage_quotas/companies are
-- live tables other code may come to depend on.

-- 1. activate_company: add the same ownership check set_company_mode and
--    update_compliance_item were already hotfixed with in production.
CREATE OR REPLACE FUNCTION public.activate_company(_company_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    checklist JSONB;
    all_complete BOOLEAN;
BEGIN
    IF NOT (is_company_admin(auth.uid()) AND get_user_company_id(auth.uid()) = _company_id) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT compliance_checklist INTO checklist
    FROM public.companies WHERE id = _company_id;

    all_complete := (
        (checklist->>'company_info')::boolean AND
        (checklist->>'admin_setup')::boolean AND
        (checklist->>'roles_defined')::boolean
    );

    IF all_complete THEN
        UPDATE public.companies
        SET status = 'active', mode = 'live'
        WHERE id = _company_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$function$;

-- 2. check_usage_quota: unused dead code (no callers in src/ or
--    supabase/functions/) — add an ownership check for defense in depth
--    rather than dropping it, since usage_quotas is a real table other
--    code may come to depend on.
CREATE OR REPLACE FUNCTION public.check_usage_quota(_company_id uuid, _quota_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF get_user_company_id(auth.uid()) IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN COALESCE(
    (SELECT used_count < max_count
     FROM public.usage_quotas
     WHERE company_id = _company_id
       AND quota_type = _quota_type
       AND period_start = date_trunc('month', now())),
    true
  );
END;
$function$;

-- 3. increment_usage_quota: same treatment as check_usage_quota.
CREATE OR REPLACE FUNCTION public.increment_usage_quota(_company_id uuid, _quota_type text, _amount integer DEFAULT 1)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_used INTEGER;
  current_max INTEGER;
  period_s TIMESTAMPTZ := date_trunc('month', now());
BEGIN
  IF get_user_company_id(auth.uid()) IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.usage_quotas (company_id, quota_type, used_count, max_count, period_start, period_end)
  VALUES (_company_id, _quota_type, _amount, 1000, period_s, period_s + interval '1 month')
  ON CONFLICT (company_id, quota_type, period_start)
  DO UPDATE SET used_count = usage_quotas.used_count + _amount, updated_at = now()
  RETURNING used_count, max_count INTO current_used, current_max;

  RETURN current_used <= current_max;
END;
$function$;

-- 4. generate_invoice_number: only ever called with the caller's own
--    company_id (src/hooks/api/useFinance.ts, src/pages/app/finance/QuotesPage.tsx).
CREATE OR REPLACE FUNCTION public.generate_invoice_number(_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_year text;
  max_seq integer;
  new_number text;
BEGIN
  IF get_user_company_id(auth.uid()) IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  current_year := to_char(now(), 'YYYY');

  SELECT COALESCE(MAX(
    CASE
      WHEN invoice_number ~ ('^' || current_year || '-\d+$')
      THEN substring(invoice_number from '\d+$')::integer
      ELSE 0
    END
  ), 0) INTO max_seq
  FROM public.invoices
  WHERE company_id = _company_id
    AND invoice_number LIKE current_year || '-%';

  new_number := current_year || '-' || lpad((max_seq + 1)::text, 4, '0');
  RETURN new_number;
END;
$function$;

-- 5. get_company_safe: zero callers anywhere in this repo — lock to
--    same-company reads for defense in depth rather than dropping, since
--    it's plausibly intended for a future pre-membership company preview.
CREATE OR REPLACE FUNCTION public.get_company_safe(_company_id uuid)
 RETURNS TABLE(id uuid, name text, logo_url text, industry text, company_size text, status text, mode text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF get_user_company_id(auth.uid()) IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.logo_url, c.industry, c.company_size, c.status, c.mode
  FROM public.companies c
  WHERE c.id = _company_id;
END;
$function$;

-- 6. get_company_status: only ever called with the caller's own
--    company_id (src/hooks/useCompanyStatus.ts).
CREATE OR REPLACE FUNCTION public.get_company_status(_company_id uuid)
 RETURNS TABLE(status text, mode text, compliance_checklist jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF get_user_company_id(auth.uid()) IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT c.status, c.mode, c.compliance_checklist
  FROM public.companies c
  WHERE c.id = _company_id;
END;
$function$;

-- 7. get_active_webhooks_for_event: the only caller is the webhook-dispatch
--    edge function, using the service-role key (confirmed by reading
--    supabase/functions/webhook-dispatch/index.ts). It returns a raw
--    webhook secret_key, so it must never be reachable by anon/authenticated
--    at all -- revoke below rather than add a check here.

-- Revoke the blanket `GRANT ALL ON ALL ROUTINES ... TO anon, authenticated`
-- (20260812000009_baseline_default_grants.sql) for all nine functions.
-- The eight above are now self-defending via the ownership check; keep
-- authenticated access for the ones real users legitimately call, and
-- drop anon entirely everywhere (none of these should ever be callable
-- unauthenticated). get_active_webhooks_for_event is service_role-only.
REVOKE EXECUTE ON FUNCTION public.activate_company(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_company(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_usage_quota(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_usage_quota(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_usage_quota(uuid, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage_quota(uuid, text, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.generate_invoice_number(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_company_safe(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_safe(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_company_status(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_status(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_company_mode(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_company_mode(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_compliance_item(uuid, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_compliance_item(uuid, text, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_active_webhooks_for_event(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_webhooks_for_event(uuid, text) TO service_role;
