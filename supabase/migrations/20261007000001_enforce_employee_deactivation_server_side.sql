-- Found during P7 auth-lifecycle adversarial review: deactivating an
-- employee (employee_profiles.is_active = false) only affected a UI
-- badge and a few list filters (Employees.tsx, AttendancePage.tsx,
-- WorkSchedulePage.tsx, TimeTrackingPage.tsx, WorkforceDashboardPage.tsx).
-- No RLS policy, RPC, or auth check anywhere referenced is_active —
-- confirmed by inspecting get_user_company_id/is_company_admin/has_role,
-- the three helper functions nearly every RLS policy in the schema is
-- built on. A "deactivated" employee kept full API/data access for as
-- long as their session lasted, with no server-side enforcement at all.
--
-- Fix: make the single most-used tenant-scoping primitive,
-- get_user_company_id(), return NULL for a user whose employee_profiles
-- row is explicitly inactive. Every RLS policy compares
-- `company_id = get_user_company_id(auth.uid())`, so this one change
-- cascades correct denial across the entire schema without touching
-- any individual policy. Users with no employee_profiles row (e.g. the
-- company owner) are unaffected — NOT EXISTS is true when there's no
-- matching row.

CREATE INDEX IF NOT EXISTS idx_employee_profiles_user_id_inactive
  ON public.employee_profiles (user_id)
  WHERE is_active = false;

CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.company_id
  FROM public.profiles p
  WHERE p.user_id = _user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_profiles ep
      WHERE ep.user_id = _user_id AND ep.is_active = false
    )
$function$;
