-- QA round 1 (2026-10-28).
--
-- 1) Leave requests on behalf of employees.
--    The Leave page lets admins/managers pick any employee in "Create leave
--    request", but the only INSERT policy allowed a user to create requests
--    for their *own* employee profile, so every admin-created request failed
--    with 403 ("Could not create request"). Allow company admins and
--    managers to register leave for employees of their own company.
DROP POLICY IF EXISTS "Admins can create leave for company employees" ON public.leave_requests;
CREATE POLICY "Admins can create leave for company employees" ON public.leave_requests
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND (is_company_admin(auth.uid()) OR has_role(auth.uid(), 'manager'::app_role))
    AND employee_profile_id IN (
      SELECT ep.id FROM public.employee_profiles ep
      WHERE ep.company_id = get_user_company_id(auth.uid())
    )
  );

-- 2) Leave date sanity: end date may not precede start date.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_dates_ordered') THEN
    ALTER TABLE public.leave_requests
      ADD CONSTRAINT leave_requests_dates_ordered CHECK (end_date >= start_date) NOT VALID;
  END IF;
END $$;

-- 3) Consent logs: anonymous inserts may not attribute consent to an
--    arbitrary user. Anonymous rows must have user_id NULL; signed-in users
--    may only log their own consent.
DROP POLICY IF EXISTS "Anyone can insert consent logs" ON public.consent_logs;
CREATE POLICY "Anyone can insert consent logs" ON public.consent_logs
  AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- 4) OAuth tokens for mailboxes must never be readable from the browser.
--    The app only needs the account metadata client-side; edge functions use
--    the service role. A column-level REVOKE has no effect while a
--    table-level SELECT grant exists, so drop the table grant and re-grant
--    every non-secret column explicitly.
REVOKE SELECT ON public.email_accounts FROM anon, authenticated;
GRANT SELECT (id, company_id, user_id, provider, email_address, status, scopes,
              connected_at, last_synced_at, token_expires_at, created_at, updated_at)
  ON public.email_accounts TO authenticated;
