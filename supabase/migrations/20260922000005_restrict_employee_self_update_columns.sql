-- Known, previously-documented gap left as a "follow-up" in
-- 20260818000005_fix_tenant_hop_rls.sql and never actually closed:
-- "Employees can update their own profile" on employee_profiles has a
-- row-level WITH CHECK (own row, own company) but no column
-- restriction, and the table-level UPDATE grant covers every column —
-- live-confirmed any employee can set their own is_active, department,
-- position, or employee_id. No frontend code or edge function updates
-- employee_profiles as a self-service action (confirmed by search), so
-- this was pure unused exposure, not a feature regression.
--
-- Same remedy already used for public.profiles: restrict the column
-- grant to what a person might legitimately self-edit (just phone here;
-- full_name/email/position/department/is_active/employee_id remain
-- admin-only via the existing "Admins can update employees in their
-- company" policy).

REVOKE UPDATE ON public.employee_profiles FROM authenticated;
GRANT UPDATE (phone) ON public.employee_profiles TO authenticated;
