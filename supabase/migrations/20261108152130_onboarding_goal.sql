-- Onboarding 6/7: let a user pick what they first want to accomplish
-- (sales/CRM, HR, or marketing) and use it to route them to a relevant
-- starting dashboard instead of the generic overview for everyone.
--
-- Stored per-user (profiles), not per-company (companies): the spec
-- explicitly warns against one employee's choice overwriting a colleague's
-- — each person in the same company can have their own.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_goal text
    CHECK (onboarding_goal IS NULL OR onboarding_goal IN ('crm', 'hr', 'marketing'));
