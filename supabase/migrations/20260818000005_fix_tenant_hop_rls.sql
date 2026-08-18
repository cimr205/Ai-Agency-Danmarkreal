-- CRITICAL: cross-tenant privilege escalation via unconstrained company_id
-- on self-scoped UPDATE policies.
--
-- Postgres RLS reuses a policy's USING clause as the implicit WITH CHECK
-- when no WITH CHECK is given. For company-scoped policies like
-- `USING (company_id = get_user_company_id(auth.uid()))` this is safe: the
-- new row must also satisfy that condition, so company_id can't change.
-- But every policy below is scoped by `user_id`/`created_by`/
-- `employee_profile_id` instead of company_id, on tables that also carry
-- their own company_id column. That leaves company_id completely
-- unconstrained on UPDATE - any authenticated user could PATCH their own
-- row's company_id to an arbitrary company and instantly gain that
-- company's tenant-scoped access everywhere else in the app (leads, deals,
-- invoices, HR data, ...), without any invitation or activation code.
--
-- Verified live and exploitable on public.profiles before this fix:
--   PATCH /rest/v1/profiles?user_id=eq.<self>  { "company_id": "<other>" }
-- succeeded and moved the test user into a company they had no access to.
--
-- Fix: add an explicit WITH CHECK to every affected policy that pins
-- company_id to the caller's own company (or, for profiles, forbids
-- changing it outright - profiles.company_id must only ever be set via the
-- SECURITY DEFINER join_company_by_code()/accept_invitation() RPCs, which
-- run as the function owner and bypass RLS/grants entirely).

-- public.profiles: also lock down which columns a user may self-edit via
-- column-level grants, since company_id must never be client-settable here
-- regardless of row ownership.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, onboarding_completed) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can update own email accounts" ON public.email_accounts;
CREATE POLICY "Users can update own email accounts" ON public.email_accounts AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS "Users can update own events" ON public.calendar_events;
CREATE POLICY "Users can update own events" ON public.calendar_events AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((created_by = auth.uid()))
  WITH CHECK ((created_by = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS "Users can update own emails" ON public.emails;
CREATE POLICY "Users can update own emails" ON public.emails AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS "Users can mark their notifications as read" ON public.notifications;
CREATE POLICY "Users can mark their notifications as read" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS "Users can update own sessions" ON public.user_sessions;
CREATE POLICY "Users can update own sessions" ON public.user_sessions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS "Users can mark their received messages as read" ON public.messages;
CREATE POLICY "Users can mark their received messages as read" ON public.messages AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((receiver_id = auth.uid()))
  WITH CHECK ((receiver_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS "Employees can update their own pending leave requests" ON public.leave_requests;
CREATE POLICY "Employees can update their own pending leave requests" ON public.leave_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((employee_profile_id IN ( SELECT employee_profiles.id FROM employee_profiles WHERE (employee_profiles.user_id = auth.uid()))) AND (status = 'pending'::leave_status)))
  WITH CHECK (((employee_profile_id IN ( SELECT employee_profiles.id FROM employee_profiles WHERE (employee_profiles.user_id = auth.uid()))) AND (company_id = get_user_company_id(auth.uid()))));

DROP POLICY IF EXISTS "Employees can check out themselves" ON public.attendance_logs;
CREATE POLICY "Employees can check out themselves" ON public.attendance_logs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((employee_profile_id IN ( SELECT employee_profiles.id FROM employee_profiles WHERE (employee_profiles.user_id = auth.uid()))))
  WITH CHECK (((employee_profile_id IN ( SELECT employee_profiles.id FROM employee_profiles WHERE (employee_profiles.user_id = auth.uid()))) AND (company_id = get_user_company_id(auth.uid()))));

DROP POLICY IF EXISTS "Users can update own generations" ON public.ai_generations;
CREATE POLICY "Users can update own generations" ON public.ai_generations AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

DROP POLICY IF EXISTS "Users can update own autopilot actions" ON public.autopilot_actions;
CREATE POLICY "Users can update own autopilot actions" ON public.autopilot_actions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));

-- employee_profiles: "Admins can update employees in their company" is also
-- TO authenticated, so column-level grants can't distinguish self-update
-- from admin-update here (grants are per-role, not per-policy) - only the
-- company_id hop is fixed below. Employees can still self-toggle
-- is_active/department/position/employee_id on their own row; that's a
-- narrower, same-company privilege issue, not a cross-tenant one, and is
-- left as a known follow-up (would need a BEFORE UPDATE trigger comparing
-- OLD vs NEW to close properly).
DROP POLICY IF EXISTS "Employees can update their own profile" ON public.employee_profiles;
CREATE POLICY "Employees can update their own profile" ON public.employee_profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())));
