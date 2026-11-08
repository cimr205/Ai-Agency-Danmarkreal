-- QA round 2 (2026-10-28).
--
-- Client error reports: anonymous visitors may still report crashes, but a
-- report can only be attributed to the reporter's own company (or none).
-- Before, anon could insert rows with any company_id and pollute another
-- tenant's error feed.
DROP POLICY IF EXISTS "Anyone can report a client error" ON public.client_error_reports;
CREATE POLICY "Anyone can report a client error" ON public.client_error_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    company_id IS NULL
    OR (auth.uid() IS NOT NULL AND company_id = get_user_company_id(auth.uid()))
  );
