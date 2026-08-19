-- Today's incident: a user's Google sign-in created a brand new, empty
-- auth.users identity/profile instead of ever reaching their real,
-- fully-set-up account - because Supabase Auth has no automatic account
-- linking by email (removed years ago for account-takeover safety), and
-- nothing in this schema stopped two separate auth.users rows from each
-- getting their own public.profiles row for the same email address.
--
-- This can't be fully fixed at the database layer (true account linking
-- requires the user to explicitly link identities via
-- supabase.auth.linkIdentity() from an already-authenticated session,
-- which is an application-level flow). But we CAN stop the silent,
-- confusing part: a second sign-up/OAuth login for an email that already
-- has a profile should never again silently get its own empty
-- profiles/company - it should just fail to get a profile at all, so the
-- app sends them to the login screen instead of dropping them into a
-- second, empty workspace.

CREATE UNIQUE INDEX profiles_email_unique_idx ON public.profiles (lower(email));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.profiles (user_id, email, full_name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NULL)
    )
    ON CONFLICT (lower(email)) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'employee');

    RETURN NEW;
END;
$function$;
