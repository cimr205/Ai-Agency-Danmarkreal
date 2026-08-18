-- JoinCompany.tsx looks up the company name for a validated activation code via
-- `supabase.from('companies').select('name')`, but every SELECT policy on
-- companies is scoped `TO authenticated`. A user on the join-code step hasn't
-- signed up yet, so that query is always blocked by RLS and the UI silently
-- falls back to "Ukendt virksomhed" / "Unknown company" for every invite.
-- validate_activation_code() already proves SECURITY DEFINER is the right
-- bypass for this pre-auth lookup; extend the same pattern to return the name.

CREATE OR REPLACE FUNCTION public.get_company_by_activation_code(_code text)
 RETURNS TABLE(id uuid, name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT id, name FROM public.companies WHERE activation_code = upper(_code)
$function$;
