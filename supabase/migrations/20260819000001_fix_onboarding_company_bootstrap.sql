-- Regression from the tenant-hop RLS fix (20260818000005): that migration
-- correctly revoked UPDATE(company_id) on profiles for authenticated users
-- to stop cross-tenant hopping, but OnboardingWizard.tsx's "create a new
-- company" step also went through a direct
-- `supabase.from('profiles').update({ company_id: companyId, ... })` call -
-- exactly the pattern that got locked down. Result: nobody could complete
-- signup by creating a new company anymore; the whole onboarding flow
-- failed with a permission-denied toast.
--
-- Fix: a SECURITY DEFINER RPC, mirroring join_company_by_code()/
-- bootstrap_company_admin() - only succeeds when the caller doesn't already
-- belong to a company, so it can't be used to hop tenants either.

CREATE OR REPLACE FUNCTION public.bootstrap_company_profile(_company_id uuid, _full_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'You already belong to a company';
  END IF;

  UPDATE public.profiles
  SET company_id = _company_id,
      full_name = COALESCE(NULLIF(trim(_full_name), ''), full_name),
      onboarding_completed = true
  WHERE user_id = auth.uid();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bootstrap_company_profile(uuid, text) TO authenticated;
