-- RLS on user_roles requires is_company_admin(auth.uid()) to insert a
-- company_admin row — but a brand-new company has no admin yet, so no one
-- could ever become the first admin. This has silently blocked every new
-- signup from getting admin rights since that policy was introduced.
--
-- Fix: a SECURITY DEFINER RPC that only succeeds once, for the company's
-- very first admin, when the caller actually belongs to that company.

CREATE OR REPLACE FUNCTION public.bootstrap_company_admin(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF get_user_company_id(auth.uid()) IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'Not authorized: caller does not belong to this company';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE p.company_id = _company_id AND ur.role = 'company_admin'
  ) THEN
    RAISE EXCEPTION 'This company already has an admin';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'company_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bootstrap_company_admin(uuid) TO authenticated;
