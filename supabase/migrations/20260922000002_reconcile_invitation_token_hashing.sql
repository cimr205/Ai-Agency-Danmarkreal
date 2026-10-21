-- Reconciles git with an undocumented production change found while
-- auditing the invitation flow: at some point, invitations.token (raw
-- token, plaintext) was replaced with token_hash (sha256 hex digest),
-- and create_invitation/accept_invitation were patched to match —
-- live-confirmed via pg_get_functiondef — but no migration file ever
-- recorded it, so every migration file in git still shows the old
-- plaintext-token design. Recorded verbatim from the live definitions;
-- not authored in this change. Idempotent against the live schema
-- (column/index already exist) — this is provenance, not a new change.

ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS token_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS invitations_token_hash_unique ON public.invitations (token_hash);

CREATE OR REPLACE FUNCTION public.create_invitation(invite_email text, invite_role app_role DEFAULT 'employee'::app_role)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t text;
  cid uuid;
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

  t := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.invitations(company_id, email, role, token_hash, invited_by, expires_at)
  values (cid, lower(invite_email), invite_role, encode(extensions.digest(t, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days');

  -- Only place the raw token is ever available — the caller must use it
  -- immediately (build the invite link) since it can never be read back.
  return t;
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_invitation(invite_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inv public.invitations%rowtype;
  caller_email text;
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
