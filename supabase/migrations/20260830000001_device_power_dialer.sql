-- Device-plan Power Dialer call outcomes. Calls themselves are placed by the
-- user's phone through an OS handoff; the CRM stores only workflow metadata.

create table public.power_dialer_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(user_id) on delete set null,
  lead_id uuid not null references public.customers(id) on delete cascade,
  phone_number text not null check (char_length(phone_number) >= 3),
  outcome text not null check (outcome in ('no_answer', 'callback', 'interested', 'not_interested')),
  notes text,
  callback_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  platform text not null check (platform in ('android', 'ios', 'web')),
  handoff_method text not null check (handoff_method in ('android_native', 'system_tel')),
  dialed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint callback_requires_time check (outcome <> 'callback' or callback_at is not null)
);

create index idx_power_dialer_calls_company_time
  on public.power_dialer_calls (company_id, dialed_at desc);
create index idx_power_dialer_calls_lead_time
  on public.power_dialer_calls (lead_id, dialed_at desc);

alter table public.power_dialer_calls enable row level security;

create policy "Company members can view power dialer calls"
  on public.power_dialer_calls
  for select to authenticated
  using (company_id = get_user_company_id(auth.uid()));

create policy "Users can log own power dialer calls"
  on public.power_dialer_calls
  for insert to authenticated
  with check (
    company_id = get_user_company_id(auth.uid())
    and user_id = auth.uid()
  );

create policy "Users can update own power dialer calls"
  on public.power_dialer_calls
  for update to authenticated
  using (
    company_id = get_user_company_id(auth.uid())
    and (user_id = auth.uid() or is_company_admin(auth.uid()))
  );

create policy "Admins can delete company power dialer calls"
  on public.power_dialer_calls
  for delete to authenticated
  using (
    company_id = get_user_company_id(auth.uid())
    and is_company_admin(auth.uid())
  );

create or replace function public.log_power_dialer_call(
  _lead_id uuid,
  _phone_number text,
  _outcome text,
  _notes text default null,
  _callback_at timestamptz default null,
  _duration_seconds integer default 0,
  _platform text default 'web',
  _handoff_method text default 'system_tel'
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  _company_id uuid;
  _call_id uuid;
  _lead_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if _outcome not in ('no_answer', 'callback', 'interested', 'not_interested') then
    raise exception 'Invalid call outcome';
  end if;

  if _outcome = 'callback' and _callback_at is null then
    raise exception 'Callback time is required';
  end if;

  if coalesce(_duration_seconds, 0) < 0 then
    raise exception 'Duration cannot be negative';
  end if;

  if char_length(regexp_replace(trim(coalesce(_phone_number, '')), '[^0-9+]', '', 'g')) < 3 then
    raise exception 'Invalid phone number';
  end if;

  select company_id into _company_id
  from public.profiles
  where user_id = auth.uid();

  select company_id into _lead_company_id
  from public.customers
  where id = _lead_id and record_type = 'lead'
  for update;

  if _company_id is null or _lead_company_id is distinct from _company_id then
    raise exception 'Lead does not belong to your company';
  end if;

  insert into public.power_dialer_calls (
    company_id,
    user_id,
    lead_id,
    phone_number,
    outcome,
    notes,
    callback_at,
    duration_seconds,
    platform,
    handoff_method
  ) values (
    _company_id,
    auth.uid(),
    _lead_id,
    regexp_replace(trim(_phone_number), '[^0-9+]', '', 'g'),
    _outcome,
    nullif(trim(coalesce(_notes, '')), ''),
    case when _outcome = 'callback' then _callback_at else null end,
    coalesce(_duration_seconds, 0),
    _platform,
    _handoff_method
  )
  returning id into _call_id;

  update public.customers
  set
    status = case
      when _outcome = 'interested' then 'qualified'::public.lead_status
      when _outcome = 'not_interested' then 'unqualified'::public.lead_status
      else 'contacted'::public.lead_status
    end,
    last_touched_at = now(),
    next_followup_at = case
      when _outcome = 'callback' then _callback_at
      else next_followup_at
    end,
    notes = case
      when nullif(trim(coalesce(_notes, '')), '') is null then notes
      else concat_ws(E'\n\n', nullif(notes, ''), '[Power Dialer] ' || trim(_notes))
    end
  where id = _lead_id and company_id = _company_id and record_type = 'lead';

  return _call_id;
end;
$$;

revoke all on function public.log_power_dialer_call(uuid, text, text, text, timestamptz, integer, text, text) from public;
grant execute on function public.log_power_dialer_call(uuid, text, text, text, timestamptz, integer, text, text) to authenticated;
