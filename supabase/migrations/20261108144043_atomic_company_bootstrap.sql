-- Onboarding 2/7: company creation was three separate client round-trips
-- (insert companies, then bootstrap_company_profile RPC, then
-- bootstrap_company_admin RPC). A failure between any two of them left an
-- orphaned company row with no linked profile/admin, which the user could
-- neither retry (bootstrap_company_profile blocks once a company exists for
-- the calling user... except it doesn't yet, since the second step never
-- ran) nor recover from without manual intervention. Replace it with one
-- atomic, SECURITY DEFINER function so a mid-flight failure rolls back
-- entirely and the user can just retry.
--
-- Also adds `country` and `timezone`, which the companies table never had —
-- onboarding needs them (CVR stays Denmark-specific and optional; country/
-- timezone apply to every tenant regardless of country).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'DK',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Copenhagen';

CREATE OR REPLACE FUNCTION public.bootstrap_company(
  _name text,
  _full_name text,
  _cvr text DEFAULT NULL,
  _country text DEFAULT 'DK',
  _timezone text DEFAULT 'Europe/Copenhagen',
  _company_size text DEFAULT NULL,
  _industry text DEFAULT NULL,
  _applicant_role text DEFAULT NULL,
  _billing_mode text DEFAULT 'full_suite'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
BEGIN
  IF trim(coalesce(_name, '')) = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'You already belong to a company';
  END IF;

  INSERT INTO public.companies (
    name, cvr, country, timezone, company_size, industry,
    onboarding_completed, applicant_role, billing_mode
  ) VALUES (
    trim(_name), nullif(trim(coalesce(_cvr, '')), ''), coalesce(_country, 'DK'), coalesce(_timezone, 'Europe/Copenhagen'),
    nullif(trim(coalesce(_company_size, '')), ''), nullif(trim(coalesce(_industry, '')), ''),
    true, _applicant_role, coalesce(_billing_mode, 'full_suite')
  )
  RETURNING id INTO _company_id;

  UPDATE public.profiles
  SET company_id = _company_id,
      full_name = COALESCE(NULLIF(trim(_full_name), ''), full_name),
      onboarding_completed = true
  WHERE user_id = auth.uid();

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (auth.uid(), _company_id, 'company_admin');

  RETURN _company_id;
END;
$function$;

-- Superseded by bootstrap_company() above, which does all three steps
-- atomically. Left in place (not dropped) since other call sites/tests may
-- still reference them and dropping is a separate, reviewable decision.
COMMENT ON FUNCTION public.bootstrap_company_profile(uuid, text) IS
  'Superseded by bootstrap_company() for new signups — kept for any other callers.';
COMMENT ON FUNCTION public.bootstrap_company_admin(uuid) IS
  'Superseded by bootstrap_company() for new signups — kept for any other callers.';

-- The existing "Authenticated users can create companies" INSERT policy only
-- required auth.uid() IS NOT NULL — any authenticated user could insert
-- unlimited, unowned company rows directly via the client, regardless of
-- whether they already belong to one. bootstrap_company() enforces "one
-- workspace per user" with its own check, but that only holds as long as
-- every caller goes through the RPC; this closes the same gap at the RLS
-- layer so direct `.from('companies').insert(...)` calls can't bypass it
-- either. (SECURITY DEFINER functions like bootstrap_company() run as the
-- function owner and aren't subject to this policy, so it doesn't affect it.)
DROP POLICY IF EXISTS "Authenticated users can create companies" ON public.companies;
CREATE POLICY "Users without a company can create exactly one"
  ON public.companies
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid() AND company_id IS NOT NULL
    )
  );
