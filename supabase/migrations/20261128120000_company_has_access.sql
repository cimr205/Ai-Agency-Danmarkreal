-- Milestone "Paid means paid", step 3 (docs: platform audit P0-1).
--
-- Until now the paywall lived only in the browser (ProtectedRoute +
-- src/lib/subscriptionAccess.ts). This gives the server the same rule so
-- edge functions (and, in a later step, RLS write policies) can enforce it.
--
-- Rule (must stay identical to hasSubscriptionAccess() in
-- src/lib/subscriptionAccess.ts, plus the ProtectedRoute "disabled" check):
--   not disabled AND (subscription_status = 'active' OR trial_ends_at > now())

CREATE OR REPLACE FUNCTION public.company_has_access(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT NOT coalesce(c.disabled, false)
       AND (c.subscription_status = 'active'
            OR (c.trial_ends_at IS NOT NULL AND c.trial_ends_at > now()))
    FROM public.companies c
    WHERE c.id = _company_id
  ), false);
$$;

COMMENT ON FUNCTION public.company_has_access(uuid) IS
  'True when the company may use paid features: not disabled and (subscription active or trial running). Mirrors src/lib/subscriptionAccess.ts.';

-- Server-side callers only for now (edge functions use the service role).
-- RLS policies call it as the policy owner, so no browser grant is needed.
REVOKE ALL ON FUNCTION public.company_has_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_has_access(uuid) TO service_role;

-- Close the matching insert hole: the client insert guard reset
-- subscription_status / Stripe ids / disabled, but not trial_ends_at, so a
-- browser could create its company with trial_ends_at = 2099 and pass the
-- rule above forever. trial_ends_at is only ever written server-side
-- (Stripe webhook, check-subscription).
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
    NEW.trial_ends_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
