-- Invitation tokens were already cryptographically strong
-- (gen_random_bytes(32), single-use, 7-day expiry) but stored in the
-- database as PLAINTEXT — if invitations were ever read via a backup
-- leak, an over-broad service-role query, or similar, every pending
-- invitation's usable token would be exposed. The raw token is now only
-- ever returned once, at creation, to the admin creating it — never
-- persisted anywhere.

alter table public.invitations add column token_hash text;

-- Backfill: hash every existing token (old plaintext values become
-- unusable as a lookup key the moment this migration lands, since
-- accept_invitation is rewritten below to only match by hash).
update public.invitations set token_hash = encode(extensions.digest(token, 'sha256'), 'hex') where token_hash is null;

alter table public.invitations alter column token_hash set not null;
create unique index invitations_token_hash_unique on public.invitations (token_hash);

-- Drop the plaintext column entirely — nothing should be able to read a
-- usable token back out of storage.
alter table public.invitations drop column token;

create or replace function public.create_invitation(invite_email text, invite_role app_role default 'employee'::app_role)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

create or replace function public.accept_invitation(invite_token text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
