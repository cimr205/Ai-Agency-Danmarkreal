-- QA #19: a single user can hold several roles at once (the owner account has
-- system_admin + company_admin + employee). Boolean capability checks via
-- has_role() are fine, but any code that needs THE role of a user could get
-- different answers in different places. Provide one canonical resolver with a
-- fixed precedence, mirrored by primaryRole in AuthContext.tsx.
CREATE OR REPLACE FUNCTION public.get_user_primary_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  WHERE ur.user_id = _user_id
  ORDER BY CASE ur.role
    WHEN 'system_admin'  THEN 1
    WHEN 'owner'         THEN 2
    WHEN 'company_admin' THEN 3
    WHEN 'manager'       THEN 4
    WHEN 'employee'      THEN 5
    WHEN 'readonly'      THEN 6
    WHEN 'partner'       THEN 7
    ELSE 99
  END
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_primary_role(uuid) TO authenticated, service_role;
