-- Found while adding rate-limit/cost-abuse guards (P5) to 13 AI edge
-- functions: increment_usage_quota() requires
-- get_user_company_id(auth.uid()) = _company_id, but every caller invokes
-- it from a service-role Supabase client (same pattern as `chat`'s
-- already-existing quota check). auth.uid() resolves to NULL under
-- service_role, so the check always raised "Not authorized" — silently,
-- since every call site only destructures `data` and ignores `error`.
-- Net effect: quota enforcement has been a no-op (fail-open) everywhere
-- it was ever wired up, including the pre-existing `chat` function.
--
-- Live-confirmed: calling the RPC with the service_role key reproduced
-- the exact "Not authorized" error before this fix.
--
-- Fix: skip the ownership check for service_role, matching the same
-- trust boundary already used by emit_workspace_event() — the edge
-- functions calling this RPC have already independently verified the
-- caller's identity and company_id via their own getUser() + profiles
-- lookup before ever reaching this call.

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
  IF auth.role() <> 'service_role' AND get_user_company_id(auth.uid()) IS DISTINCT FROM _company_id THEN
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
