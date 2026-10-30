-- QA #18: the companies INSERT policy only requires auth.uid() IS NOT NULL, so a
-- single authenticated user can POST /rest/v1/companies in a loop and spam-create
-- unlimited companies, bypassing the sign-up/onboarding flow.
--
-- 20261028000004 already forces safe billing values on client inserts; this adds
-- the missing count limit. A normal user self-creates exactly ONE company (their
-- own, during onboarding) and afterwards joins any other company with an
-- activation code — they never create a second one from the browser. So block a
-- non-service-role insert when the caller already belongs to / owns a company.
-- Legitimate multi-company creation goes through the service role (admin tools).
CREATE OR REPLACE FUNCTION public.companies_client_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    -- Billing/state columns are server-owned (kept from 20261028000004).
    NEW.subscription_status := 'none';
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.disabled := false;

    -- Spam guard: one self-service company per user.
    IF EXISTS (
         SELECT 1 FROM public.profiles p
         WHERE p.user_id = auth.uid() AND p.company_id IS NOT NULL
       )
       OR EXISTS (
         SELECT 1 FROM public.user_roles ur
         WHERE ur.user_id = auth.uid()
       ) THEN
      RAISE EXCEPTION 'You already belong to a company. Joining another requires an activation code.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger already exists from 20261028000004 and points at this function name;
-- CREATE OR REPLACE above updates the body in place. Re-assert it defensively.
DROP TRIGGER IF EXISTS companies_client_insert_guard ON public.companies;
CREATE TRIGGER companies_client_insert_guard
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_client_insert_guard();
