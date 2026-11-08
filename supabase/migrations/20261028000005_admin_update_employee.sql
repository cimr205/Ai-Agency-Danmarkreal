-- QA 2026-10-28: employee records could not be edited or deactivated from
-- the app. Column grants only allow `phone` to be updated client-side
-- (20260922000005), so the Employees detail sheet was read-only and a
-- duplicate/wrong record could never be fixed. Expose one audited,
-- permission-checked RPC for company admins and managers instead of
-- re-opening the column grants.
CREATE OR REPLACE FUNCTION public.admin_update_employee(
  _employee_id uuid,
  _full_name text,
  _position text,
  _department text,
  _phone text,
  _is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_user uuid;
BEGIN
  SELECT company_id, user_id INTO v_company, v_user
  FROM public.employee_profiles WHERE id = _employee_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Employee not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_company IS DISTINCT FROM public.get_user_company_id(auth.uid())
     OR NOT (public.is_company_admin(auth.uid()) OR public.has_role(auth.uid(), 'manager'::app_role)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_user = auth.uid() AND _is_active = false THEN
    RAISE EXCEPTION 'You cannot deactivate yourself' USING ERRCODE = '42501';
  END IF;

  UPDATE public.employee_profiles
  SET full_name  = coalesce(nullif(btrim(_full_name), ''), full_name),
      position   = nullif(btrim(coalesce(_position, '')), ''),
      department = nullif(btrim(coalesce(_department, '')), ''),
      phone      = nullif(btrim(coalesce(_phone, '')), ''),
      is_active  = coalesce(_is_active, is_active)
  WHERE id = _employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_employee(uuid, text, text, text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_employee(uuid, text, text, text, text, boolean) TO authenticated;

-- Payroll rows could be created but never removed, so an accidental
-- duplicate (same employee + period) stayed in the month's total forever.
DROP POLICY IF EXISTS "Admins can delete payroll" ON public.payroll;
CREATE POLICY "Admins can delete payroll" ON public.payroll AS PERMISSIVE FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));
