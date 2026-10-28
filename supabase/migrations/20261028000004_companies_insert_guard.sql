-- QA 2026-10-28: companies can be created straight from the browser (the
-- onboarding wizard inserts the row itself), and the INSERT policy only
-- checks auth.uid() IS NOT NULL — so a client could create its company with
-- subscription_status = 'active' and arbitrary Stripe ids, bypassing
-- billing. Billing/state columns are owned by the server (Stripe webhook,
-- admin tools, service role), so force safe values on client inserts.
CREATE OR REPLACE FUNCTION public.companies_client_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    NEW.subscription_status := 'none';
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.disabled := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_client_insert_guard ON public.companies;
CREATE TRIGGER companies_client_insert_guard
  BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_client_insert_guard();

-- Same problem on UPDATE: "Admins can update their company" lets any
-- company_admin PATCH their own subscription_status / seats / trial end
-- through the REST API. Only the service role (Stripe webhook,
-- check-subscription) and platform system admins may change those.
CREATE OR REPLACE FUNCTION public.companies_billing_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR public.has_role(auth.uid(), 'system_admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.purchased_seats IS DISTINCT FROM OLD.purchased_seats
     OR NEW.seat_limit_trial IS DISTINCT FROM OLD.seat_limit_trial
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.disabled IS DISTINCT FROM OLD.disabled THEN
    RAISE EXCEPTION 'Billing fields can only be changed by the billing system'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_billing_update_guard ON public.companies;
CREATE TRIGGER companies_billing_update_guard
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_billing_update_guard();
