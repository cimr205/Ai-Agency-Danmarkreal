-- #027 — enforce seat availability in create_invitation.
--
-- Before: create_invitation only checked admin role + duplicate pending invites,
-- so a company admin could invite unlimited billable users with no cap.
-- After: the function also requires an available seat. Used seats (current members
-- + outstanding pending invitations) must be below the company's capacity
-- (purchased_seats when subscribed, otherwise seat_limit_trial during the trial).
--
-- Policy note (tune on staging if needed): when capacity is 0 (no plan/trial seats
-- yet) invitations are blocked — the admin must start a subscription/trial first.
-- The admin's own account is created via bootstrap_company_admin, not this function,
-- so initial onboarding is unaffected.

CREATE OR REPLACE FUNCTION public.create_invitation(invite_email text, invite_role app_role DEFAULT 'employee'::app_role)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t text;
  cid uuid;
  seat_cap integer;
  seats_used integer;
begin
  if not is_company_admin(auth.uid()) then
    raise exception 'Not authorized to invite';
  end if;

  select company_id into cid from public.profiles where user_id = auth.uid();
  if cid is null then
    raise exception 'No company associated with your profile';
  end if;

  if exists (
    select 1 from public.invitations
    where company_id = cid and lower(email) = lower(invite_email) and status = 'pending' and expires_at > now()
  ) then
    raise exception 'A pending invitation already exists for this email';
  end if;

  -- Seat capacity: purchased seats when subscribed, else the trial seat limit.
  select greatest(coalesce(purchased_seats, 0), coalesce(seat_limit_trial, 0))
    into seat_cap
  from public.companies
  where id = cid;

  -- Seats already consumed: current members + outstanding pending invitations.
  select
    (select count(*) from public.profiles p where p.company_id = cid)
    + (select count(*) from public.invitations i
         where i.company_id = cid and i.status = 'pending' and i.expires_at > now())
    into seats_used;

  if coalesce(seat_cap, 0) <= 0 then
    raise exception 'Ingen pladser er købt endnu - start et abonnement for at invitere brugere';
  end if;

  if seats_used >= seat_cap then
    raise exception 'Ingen ledige pladser (% af % brugt) - opgrader for at invitere flere', seats_used, seat_cap;
  end if;

  t := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.invitations(company_id, email, role, token_hash, invited_by, expires_at)
  values (cid, lower(invite_email), invite_role, encode(extensions.digest(t, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days');

  -- Only place the raw token is ever available — the caller must use it
  -- immediately (build the invite link) since it can never be read back.
  return t;
end;
$function$;
