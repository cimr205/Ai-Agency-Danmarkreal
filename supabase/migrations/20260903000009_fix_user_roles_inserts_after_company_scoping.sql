-- Fixes a regression introduced by 20260903000007/08: four functions
-- inserted into user_roles(user_id, role) with no company_id, and used
-- ON CONFLICT (user_id, role) against a constraint that migration
-- deliberately dropped. Without this fix, every new signup, invitation
-- acceptance, company-code join, and first-admin bootstrap would now
-- fail outright.

-- handle_new_user: root-cause fix, not a patch. This function fires at
-- signup, before the user has ever joined or created a company — there
-- is no company_id to give it. Its old unconditional user_roles insert
-- is exactly why 3 orphaned (company_id IS NULL) rows existed before
-- 20260903000007 backfilled around them. Role assignment now happens
-- only where a company_id is actually known: join_company_by_code,
-- accept_invitation, and bootstrap_company_admin below.
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

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_company_by_code(_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_company_id uuid;
  sanitized_code text;
BEGIN
  sanitized_code := upper(trim(_code));

  IF length(sanitized_code) < 4 OR length(sanitized_code) > 20 THEN
    RAISE EXCEPTION 'Invalid code format';
  END IF;

  SELECT id INTO target_company_id FROM public.companies WHERE activation_code = sanitized_code;
  IF target_company_id IS NULL THEN
    RAISE EXCEPTION 'Ugyldig virksomhedskode';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Du tilhører allerede en virksomhed';
  END IF;
  UPDATE public.profiles SET company_id = target_company_id, onboarding_completed = true WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, company_id, role) VALUES (auth.uid(), target_company_id, 'employee')
    ON CONFLICT (user_id, company_id, role) WHERE company_id IS NOT NULL DO NOTHING;
  INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, description)
  VALUES (auth.uid(), target_company_id, 'employee_joined', 'profile', 'Medarbejder tilsluttet via virksomhedskode');
  RETURN target_company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_invitation(invite_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv public.invitations%ROWTYPE;
  caller_email text;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE token = invite_token LIMIT 1;

  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;

  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer pending (status: %)', inv.status;
  END IF;

  IF inv.expires_at < now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF lower(caller_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'You already belong to a company';
  END IF;

  UPDATE public.profiles
  SET company_id = inv.company_id, onboarding_completed = true
  WHERE user_id = auth.uid();

  INSERT INTO public.user_roles(user_id, company_id, role)
  VALUES (auth.uid(), inv.company_id, inv.role)
  ON CONFLICT (user_id, company_id, role) WHERE company_id IS NOT NULL DO NOTHING;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = inv.id;

  RETURN inv.company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bootstrap_company_admin(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF get_user_company_id(auth.uid()) IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'Not authorized: caller does not belong to this company';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE p.company_id = _company_id AND ur.role = 'company_admin'
  ) THEN
    RAISE EXCEPTION 'This company already has an admin';
  END IF;

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (auth.uid(), _company_id, 'company_admin')
  ON CONFLICT (user_id, company_id, role) WHERE company_id IS NOT NULL DO NOTHING;
END;
$function$;
