-- Epic 5: authenticated nearby-phone pairing and durable call-command relay.

create table if not exists public.phone_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  platform text not null check (platform in ('ios','android')),
  os_version text,
  app_version text,
  device_token_hash text not null unique,
  status text not null default 'offline' check (status in ('offline','online','revoked')),
  capabilities jsonb not null default '{}'::jsonb,
  paired_at timestamptz not null default now(),
  last_heartbeat_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.phone_pairing_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  pairing_secret_hash text not null,
  short_code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  device_id uuid references public.phone_devices(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.phone_pairing_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.phone_pairing_rate_limits enable row level security;

create or replace function public.consume_phone_pairing_attempt(p_key_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_attempts integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if nullif(trim(p_key_hash), '') is null then return false; end if;
  insert into public.phone_pairing_rate_limits (key_hash, window_started_at, attempts, updated_at)
  values (p_key_hash, now(), 1, now())
  on conflict (key_hash) do update
  set attempts = case
        when public.phone_pairing_rate_limits.window_started_at < now() - interval '10 minutes' then 1
        else public.phone_pairing_rate_limits.attempts + 1 end,
      window_started_at = case
        when public.phone_pairing_rate_limits.window_started_at < now() - interval '10 minutes' then now()
        else public.phone_pairing_rate_limits.window_started_at end,
      updated_at = now()
  returning attempts into v_attempts;
  return v_attempts <= 20;
end;
$$;

revoke all on function public.consume_phone_pairing_attempt(text) from public;
grant execute on function public.consume_phone_pairing_attempt(text) to service_role;

create table if not exists public.phone_call_commands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  device_id uuid not null references public.phone_devices(id) on delete cascade,
  lead_id uuid references public.customers(id) on delete set null,
  idempotency_key text not null,
  phone_number text not null,
  normalized_phone text not null,
  display_name text,
  status text not null default 'queued'
    check (status in ('queued','delivered','acknowledged','awaiting_confirmation','ringing','connected','completed','failed','rejected','cancelled','expired')),
  requires_confirmation boolean not null default true,
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  started_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create table if not exists public.phone_call_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  command_id uuid not null references public.phone_call_commands(id) on delete cascade,
  device_id uuid not null references public.phone_devices(id) on delete cascade,
  event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (device_id, event_id)
);

create index if not exists phone_devices_user_status_idx on public.phone_devices (user_id, status, last_heartbeat_at desc);
create index if not exists phone_pairing_expiry_idx on public.phone_pairing_sessions (expires_at) where claimed_at is null;
create index if not exists phone_commands_device_queue_idx on public.phone_call_commands (device_id, created_at)
  where status in ('queued','delivered');
create index if not exists phone_commands_company_time_idx on public.phone_call_commands (company_id, created_at desc);

alter table public.phone_devices enable row level security;
alter table public.phone_pairing_sessions enable row level security;
alter table public.phone_call_commands enable row level security;
alter table public.phone_call_events enable row level security;

create policy "Users read own paired devices" on public.phone_devices for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()) and (user_id = auth.uid() or public.is_company_admin(auth.uid())));
create policy "Users read own pairing sessions" on public.phone_pairing_sessions for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()) and user_id = auth.uid());
create policy "Users read own call commands" on public.phone_call_commands for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()) and (user_id = auth.uid() or public.is_company_admin(auth.uid())));
create policy "Users read own call events" on public.phone_call_events for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()) and exists (
    select 1 from public.phone_call_commands c where c.id = command_id and (c.user_id = auth.uid() or public.is_company_admin(auth.uid()))
  ));

create or replace function public.create_phone_pairing_session()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_id uuid := gen_random_uuid();
  v_secret text := encode(gen_random_bytes(32), 'hex');
  v_code text := lpad((floor(random() * 1000000))::integer::text, 6, '0');
  v_expires timestamptz := now() + interval '10 minutes';
begin
  if auth.uid() is null or v_company_id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  delete from public.phone_pairing_sessions where user_id = auth.uid() and claimed_at is null;
  insert into public.phone_pairing_sessions (
    id, company_id, user_id, pairing_secret_hash, short_code_hash, expires_at
  ) values (
    v_id, v_company_id, auth.uid(), encode(digest(v_secret, 'sha256'), 'hex'),
    encode(digest(v_code, 'sha256'), 'hex'), v_expires
  );
  return jsonb_build_object(
    'pairing_session_id', v_id, 'pairing_secret', v_secret, 'short_code', v_code,
    'expires_at', v_expires,
    'qr_payload', jsonb_build_object('version', 1, 'session_id', v_id, 'secret', v_secret)
  );
end;
$$;

create or replace function public.create_phone_call_command(
  p_device_id uuid,
  p_phone_number text,
  p_lead_id uuid default null,
  p_display_name text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_device public.phone_devices%rowtype;
  v_command public.phone_call_commands%rowtype;
  v_phone text := public.normalize_phone_number(p_phone_number);
  v_key text := coalesce(nullif(trim(p_idempotency_key), ''), gen_random_uuid()::text);
  v_requires_confirmation boolean;
begin
  if auth.uid() is null or v_company_id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if v_phone is null then raise exception 'A valid phone number is required' using errcode = '22023'; end if;
  select * into v_device from public.phone_devices
  where id = p_device_id and company_id = v_company_id and user_id = auth.uid() and status = 'online'
    and last_heartbeat_at > now() - interval '75 seconds' and revoked_at is null;
  if not found then raise exception 'Phone is not online and verified nearby' using errcode = '55000'; end if;
  if p_lead_id is not null and not exists (
    select 1 from public.customers where id = p_lead_id and company_id = v_company_id and record_type = 'lead'
  ) then raise exception 'Lead not found' using errcode = 'P0002'; end if;

  v_requires_confirmation := v_device.platform = 'ios'
    or coalesce((v_device.capabilities->>'direct_carrier_call')::boolean, false) = false;
  insert into public.phone_call_commands (
    company_id, user_id, device_id, lead_id, idempotency_key, phone_number,
    normalized_phone, display_name, requires_confirmation, metadata
  ) values (
    v_company_id, auth.uid(), p_device_id, p_lead_id, v_key, p_phone_number,
    v_phone, p_display_name, v_requires_confirmation, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (company_id, idempotency_key) do update
    set updated_at = public.phone_call_commands.updated_at
  returning * into v_command;
  return jsonb_build_object(
    'command_id', v_command.id, 'status', v_command.status,
    'requires_confirmation', v_command.requires_confirmation,
    'expires_at', v_command.expires_at
  );
end;
$$;

create or replace function public.revoke_phone_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_company_id uuid := public.get_user_company_id(auth.uid());
begin
  if auth.uid() is null or v_company_id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  update public.phone_devices set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = p_device_id and company_id = v_company_id
    and (user_id = auth.uid() or public.is_company_admin(auth.uid()));
  return found;
end;
$$;

revoke all on function public.create_phone_pairing_session() from public;
grant execute on function public.create_phone_pairing_session() to authenticated;
revoke all on function public.create_phone_call_command(uuid, text, uuid, text, text, jsonb) from public;
grant execute on function public.create_phone_call_command(uuid, text, uuid, text, text, jsonb) to authenticated;
revoke all on function public.revoke_phone_device(uuid) from public;
grant execute on function public.revoke_phone_device(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.phone_devices;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.phone_call_commands;
exception when duplicate_object then null;
end $$;
