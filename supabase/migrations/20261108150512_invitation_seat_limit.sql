-- Onboarding 4/7: accept_invitation() had no seat-limit check at all — a
-- company could accept unlimited invitations regardless of its actual
-- subscription (trialing seat_limit_trial, or paid purchased_seats). The
-- spec asks for one consistent rule on whether a seat is reserved at invite
-- time or counted at accept time; this project's own check-subscription
-- "seat mismatch" logic already counts live `profiles` rows (i.e. accepted
-- members), not pending invitations — so counting at accept time is the
-- choice already implicit elsewhere in the codebase, not a new one.
--
-- Note: this intentionally does NOT block create_invitation() itself —
-- inviting is free (no seat consumed yet), only *accepting* when full is
-- blocked, matching "respect the actual subscription state" without making
-- the invite flow itself seat-constrained in a way that would need
-- canceling/reissuing invites as seats free up.

CREATE OR REPLACE FUNCTION public.accept_invitation(invite_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inv public.invitations%rowtype;
  caller_email text;
  seat_limit int;
  current_members int;
begin
  select * into inv from public.invitations where token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex') limit 1;

  if inv.id is null then
    raise exception 'Invalid invitation token';
  end if;

  if inv.status <> 'pending' then
    raise exception 'Invitation is no longer pending (status: %)', inv.status;
  end if;

  if inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'Invitation has expired';
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if lower(caller_email) <> lower(inv.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  if exists (select 1 from public.profiles where user_id = auth.uid() and company_id is not null) then
    raise exception 'You already belong to a company';
  end if;

  select case
    when subscription_status = 'active' then coalesce(purchased_seats, 0)
    when subscription_status = 'trialing' then coalesce(seat_limit_trial, 0)
    else 0
  end into seat_limit
  from public.companies where id = inv.company_id;

  select count(*) into current_members from public.profiles where company_id = inv.company_id;

  if current_members >= seat_limit then
    raise exception 'No paid seats are available for this company right now. Ask an admin to add seats before accepting.';
  end if;

  update public.profiles
  set company_id = inv.company_id, onboarding_completed = true
  where user_id = auth.uid();

  insert into public.user_roles(user_id, company_id, role)
  values (auth.uid(), inv.company_id, inv.role)
  on conflict (user_id, company_id, role) where company_id is not null do nothing;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = inv.id;

  return inv.company_id;
end;
$function$;

-- Exposed so InvitationsPage can show "X of Y seats used" and warn before
-- an admin sends an invite that the invitee won't be able to accept.
CREATE OR REPLACE FUNCTION public.get_seat_usage()
 RETURNS TABLE(seat_limit int, used int)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cid uuid;
begin
  select company_id into cid from public.profiles where user_id = auth.uid();
  if cid is null then
    raise exception 'No company associated with your profile';
  end if;

  return query
  select
    (case
      when c.subscription_status = 'active' then coalesce(c.purchased_seats, 0)
      when c.subscription_status = 'trialing' then coalesce(c.seat_limit_trial, 0)
      else 0
    end)::int as seat_limit,
    (select count(*)::int from public.profiles p where p.company_id = cid) as used
  from public.companies c
  where c.id = cid;
end;
$function$;
