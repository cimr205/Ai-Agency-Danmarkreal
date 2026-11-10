-- Onboarding 7/7: no analytics/event-tracking exists anywhere in this
-- codebase (verified — no posthog/analytics.track/trackEvent references).
-- Spec asks for the 5 activation events, privacy-conscious, no PII. A
-- minimal first-party table is the smallest thing that satisfies that
-- without pulling in a third-party SDK/credentials this session has no
-- access to configure or test.
--
-- No free text, no emails, no names — only IDs and an event name from a
-- closed set.

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name text NOT NULL CHECK (event_name IN (
    'onboarding_started',
    'company_created',
    'subscription_activated',
    'onboarding_completed',
    'first_value_action_completed'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_events_company_idx ON public.product_events (company_id, event_name);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

-- Write-only from the caller own session. company_id may be null — the
-- onboarding_started event fires before a company exists at all — but
-- when present it must match the caller own company via
-- get_user_company_id(), never a different tenant.
CREATE POLICY "Users can log events for their own company"
  ON public.product_events
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (company_id IS NULL OR company_id = public.get_user_company_id(auth.uid()))
  );

-- Reads are admin-only — this is activation data for the business, not
-- something every employee needs visibility into.
CREATE POLICY "Company admins can read their events"
  ON public.product_events
  FOR SELECT
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_admin(auth.uid())
  );
