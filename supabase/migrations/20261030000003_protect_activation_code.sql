-- QA #15: GET /rest/v1/companies?select=* (or ?select=activation_code) returns
-- the activation_code column. A company_admin can read their own, but a
-- system_admin — whose RLS lets them see every company — can read ALL 13
-- companies' join codes with a single crafted request. The activation code is
-- the key to join a company, so it must never be reachable through a plain REST
-- select.
--
-- Fix without moving the column (which would force repointing six SECURITY
-- DEFINER functions): revoke column-level SELECT from the client roles. The
-- generate/validate/get-by-code/join/regenerate functions are all SECURITY
-- DEFINER and run as the owner, so they keep working; only direct REST reads of
-- the column are blocked. A dedicated SECURITY DEFINER reader returns the code
-- to a company's own admin for the settings screen.

REVOKE SELECT (activation_code) ON public.companies FROM anon, authenticated;

-- Own-company admin reader for the Company Settings screen.
CREATE OR REPLACE FUNCTION public.get_company_activation_code(_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text;
BEGIN
  IF NOT (
    get_user_company_id(auth.uid()) = _company_id
    AND has_role(auth.uid(), 'company_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT activation_code INTO code FROM public.companies WHERE id = _company_id;
  RETURN code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_activation_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_activation_code(uuid) TO authenticated;
