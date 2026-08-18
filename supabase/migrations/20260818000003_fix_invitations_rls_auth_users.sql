-- "Users can read invitation by matching token" subqueries auth.users to look
-- up the caller's own email, but `authenticated` has no SELECT grant on
-- auth.users (Supabase never grants that by default, for good reason - it
-- would let any authenticated user read every user's row if RLS didn't also
-- apply there). Because Postgres evaluates every disjunct's table
-- permissions when planning an RLS policy, this made ANY select on
-- public.invitations fail outright with "permission denied for table users"
-- (42501) - even for the company-admin branch of the OR, which needs no
-- auth.users access at all. This is why Settings > Invitations always showed
-- an empty list even after an invitation was created successfully.
--
-- Fix: use auth.jwt() ->> 'email', Supabase's standard helper for the
-- caller's own email from their JWT claims, instead of querying auth.users.

DROP POLICY IF EXISTS "Users can read invitation by matching token" ON public.invitations;

CREATE POLICY "Users can read invitation by matching token" ON public.invitations AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    OR ((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid()))
  );
