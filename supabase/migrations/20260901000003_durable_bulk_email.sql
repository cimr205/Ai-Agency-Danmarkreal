-- Epic 2: durable, resumable bulk-email orchestration.

alter table public.bulk_email_campaigns
  add column if not exists html_body text,
  add column if not exists text_body text,
  add column if not exists from_email text,
  add column if not exists from_name text,
  add column if not exists reply_to text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists cancelled_at timestamptz;

create table if not exists public.email_campaign_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_id uuid not null references public.bulk_email_campaigns(id) on delete cascade,
  created_by uuid not null,
  idempotency_key text not null,
  status text not null default 'queued'
    check (status in ('queued','scheduled','running','paused','cancelled','completed','failed')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz,
  last_error text,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create table if not exists public.campaign_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_id uuid not null references public.bulk_email_campaigns(id) on delete cascade,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  content_id text,
  disposition text not null default 'attachment' check (disposition in ('attachment','inline')),
  checksum_sha256 text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, storage_bucket, storage_path)
);

create table if not exists public.email_suppression_list (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  normalized_email text generated always as (lower(trim(email))) stored,
  reason text not null check (reason in ('unsubscribe','hard_bounce','complaint','manual','invalid')),
  source text,
  source_event_id text,
  suppressed_at timestamptz not null default now(),
  created_by uuid,
  unique (company_id, normalized_email)
);

create table if not exists public.email_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  campaign_job_id uuid not null references public.email_campaign_jobs(id) on delete cascade,
  campaign_id uuid not null references public.bulk_email_campaigns(id) on delete cascade,
  recipient_id uuid references public.bulk_email_recipients(id) on delete set null,
  recipient_email text not null,
  normalized_email text generated always as (lower(trim(recipient_email))) stored,
  recipient_name text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','processing','retry','sent','delivered','opened','clicked','bounced','complained','suppressed','cancelled','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  lock_token uuid,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_job_id, recipient_id)
);

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  delivery_job_id uuid references public.email_delivery_jobs(id) on delete set null,
  provider_event_id text not null,
  provider_message_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (company_id, provider_event_id)
);

create index if not exists email_campaign_jobs_claim_idx
  on public.email_campaign_jobs (status, scheduled_at, created_at)
  where status in ('queued','scheduled','running');
create index if not exists email_delivery_jobs_claim_idx
  on public.email_delivery_jobs (next_attempt_at, created_at)
  where status in ('queued','retry','processing');
create index if not exists email_delivery_jobs_campaign_idx
  on public.email_delivery_jobs (campaign_job_id, status);
create index if not exists email_delivery_jobs_provider_idx
  on public.email_delivery_jobs (provider_message_id)
  where provider_message_id is not null;

insert into storage.buckets (id, name, public, file_size_limit)
values ('campaign-assets', 'campaign-assets', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy "Company members upload campaign assets" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'campaign-assets'
    and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );
create policy "Company members read campaign assets storage" on storage.objects
  for select to authenticated using (
    bucket_id = 'campaign-assets'
    and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );
create policy "Company members delete campaign assets storage" on storage.objects
  for delete to authenticated using (
    bucket_id = 'campaign-assets'
    and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

alter table public.email_campaign_jobs enable row level security;
alter table public.campaign_assets enable row level security;
alter table public.email_suppression_list enable row level security;
alter table public.email_delivery_jobs enable row level security;
alter table public.email_delivery_events enable row level security;

create policy "Company members read campaign jobs" on public.email_campaign_jobs
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Company members read campaign assets" on public.campaign_assets
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Company members manage campaign assets" on public.campaign_assets
  for all to authenticated
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()) and created_by = auth.uid());
create policy "Company members read suppression list" on public.email_suppression_list
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Company admins manage suppression list" on public.email_suppression_list
  for all to authenticated
  using (company_id = public.get_user_company_id(auth.uid()) and public.is_company_admin(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()) and public.is_company_admin(auth.uid()));
create policy "Company members read delivery jobs" on public.email_delivery_jobs
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Company members read delivery events" on public.email_delivery_events
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));

create or replace function public.enqueue_email_campaign(
  p_campaign_id uuid,
  p_idempotency_key text,
  p_html_body text,
  p_text_body text default null,
  p_from_email text default null,
  p_from_name text default null,
  p_reply_to text default null,
  p_scheduled_at timestamptz default null,
  p_max_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_campaign public.bulk_email_campaigns%rowtype;
  v_job_id uuid;
  v_inserted integer;
  v_suppressed integer;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_html_body, '')), '') is null then
    raise exception 'Email body is required' using errcode = '22023';
  end if;

  select * into v_campaign
  from public.bulk_email_campaigns
  where id = p_campaign_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;

  insert into public.email_campaign_jobs (
    company_id, campaign_id, created_by, idempotency_key, status, scheduled_at
  ) values (
    v_company_id, p_campaign_id, auth.uid(), trim(p_idempotency_key),
    case when p_scheduled_at is not null and p_scheduled_at > now() then 'scheduled' else 'queued' end,
    p_scheduled_at
  )
  on conflict (company_id, idempotency_key) do update
    set updated_at = public.email_campaign_jobs.updated_at
  returning id into v_job_id;

  update public.bulk_email_campaigns
  set html_body = p_html_body,
      text_body = p_text_body,
      from_email = p_from_email,
      from_name = p_from_name,
      reply_to = p_reply_to,
      scheduled_at = p_scheduled_at,
      status = case when p_scheduled_at is not null and p_scheduled_at > now() then 'scheduled' else 'queued' end,
      completed_at = null,
      cancelled_at = null
  where id = p_campaign_id;

  insert into public.email_delivery_jobs (
    company_id, campaign_job_id, campaign_id, recipient_id,
    recipient_email, recipient_name, payload, status, max_attempts
  )
  select
    v_company_id, v_job_id, p_campaign_id, r.id, r.email, r.name,
    jsonb_build_object(
      'subject', v_campaign.subject,
      'html', p_html_body,
      'text', p_text_body,
      'from_email', p_from_email,
      'from_name', p_from_name,
      'reply_to', p_reply_to
    ),
    case when exists (
      select 1 from public.email_suppression_list s
      where s.company_id = v_company_id and s.normalized_email = lower(trim(r.email))
    ) or r.unsubscribed_at is not null then 'suppressed' else 'queued' end,
    least(greatest(coalesce(p_max_attempts, 5), 1), 20)
  from public.bulk_email_recipients r
  where r.campaign_id = p_campaign_id and r.company_id = v_company_id
  on conflict (campaign_job_id, recipient_id) do nothing;
  get diagnostics v_inserted = row_count;

  select count(*) into v_suppressed
  from public.email_delivery_jobs
  where campaign_job_id = v_job_id and status = 'suppressed';

  update public.bulk_email_campaigns c
  set total_recipients = (
        select count(*) from public.email_delivery_jobs d where d.campaign_job_id = v_job_id
      ),
      total_errors = v_suppressed
  where c.id = p_campaign_id;

  return jsonb_build_object(
    'job_id', v_job_id,
    'campaign_id', p_campaign_id,
    'created_deliveries', v_inserted,
    'suppressed', v_suppressed
  );
end;
$$;

create or replace function public.control_email_campaign(
  p_job_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_job public.email_campaign_jobs%rowtype;
  v_status text;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v_job from public.email_campaign_jobs
  where id = p_job_id and company_id = v_company_id for update;
  if not found then raise exception 'Campaign job not found' using errcode = 'P0002'; end if;

  v_status := case lower(p_action)
    when 'pause' then 'paused'
    when 'resume' then case when v_job.scheduled_at > now() then 'scheduled' else 'queued' end
    when 'cancel' then 'cancelled'
    else null
  end;
  if v_status is null then raise exception 'Unsupported campaign action' using errcode = '22023'; end if;
  if v_job.status in ('completed','cancelled') then
    raise exception 'Campaign job is already terminal' using errcode = '55000';
  end if;

  update public.email_campaign_jobs
  set status = v_status, updated_at = now(),
      completed_at = case when v_status = 'cancelled' then now() else completed_at end
  where id = p_job_id;
  update public.bulk_email_campaigns
  set status = v_status,
      cancelled_at = case when v_status = 'cancelled' then now() else cancelled_at end
  where id = v_job.campaign_id;
  if v_status = 'cancelled' then
    update public.email_delivery_jobs set status = 'cancelled', updated_at = now()
    where campaign_job_id = p_job_id and status in ('queued','retry');
  end if;
  return jsonb_build_object('job_id', p_job_id, 'status', v_status);
end;
$$;

create or replace function public.claim_email_delivery_jobs(p_limit integer default 25)
returns table (
  delivery_id uuid,
  recipient_id uuid,
  campaign_job_id uuid,
  campaign_id uuid,
  company_id uuid,
  sender_user_id uuid,
  recipient_email text,
  recipient_name text,
  payload jsonb,
  lock_token uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select d.id
    from public.email_delivery_jobs d
    join public.email_campaign_jobs j on j.id = d.campaign_job_id
    where d.status in ('queued','retry','processing')
      and d.next_attempt_at <= now()
      and (d.status <> 'processing' or d.lease_expires_at < now())
      and j.status in ('queued','scheduled','running')
      and (j.scheduled_at is null or j.scheduled_at <= now())
    order by d.next_attempt_at, d.created_at
    for update of d skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ), claimed as (
    update public.email_delivery_jobs d
    set status = 'processing', attempts = d.attempts + 1,
        lock_token = gen_random_uuid(), lease_expires_at = now() + interval '2 minutes',
        updated_at = now()
    from candidates c
    where d.id = c.id
    returning d.*
  )
  select c.id, c.recipient_id, c.campaign_job_id, c.campaign_id, c.company_id,
         j.created_by, c.recipient_email, c.recipient_name, c.payload, c.lock_token, c.attempts
  from claimed c
  join public.email_campaign_jobs j on j.id = c.campaign_job_id;

  update public.email_campaign_jobs j
  set status = 'running', started_at = coalesce(started_at, now()),
      heartbeat_at = now(), updated_at = now()
  where j.id in (
    select d.campaign_job_id from public.email_delivery_jobs d
    where d.status = 'processing' and d.lease_expires_at > now()
  ) and j.status in ('queued','scheduled');
end;
$$;

create or replace function public.complete_email_delivery(
  p_delivery_id uuid,
  p_lock_token uuid,
  p_status text,
  p_provider_message_id text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.email_delivery_jobs%rowtype;
  v_final_status text;
  v_remaining bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_delivery from public.email_delivery_jobs
  where id = p_delivery_id and lock_token = p_lock_token for update;
  if not found then raise exception 'Delivery lease not found' using errcode = 'P0002'; end if;

  if p_status in ('sent','suppressed','cancelled') then
    v_final_status := p_status;
  elsif v_delivery.attempts >= v_delivery.max_attempts then
    v_final_status := 'failed';
  else
    v_final_status := 'retry';
  end if;

  update public.email_delivery_jobs
  set status = v_final_status,
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      last_error = p_error,
      sent_at = case when v_final_status = 'sent' then now() else sent_at end,
      next_attempt_at = case when v_final_status = 'retry'
        then now() + make_interval(secs => least(3600, 30 * (2 ^ greatest(attempts - 1, 0))))
        else next_attempt_at end,
      lease_expires_at = null, lock_token = null, updated_at = now()
  where id = p_delivery_id;

  update public.bulk_email_recipients
  set status = v_final_status,
      error_message = case when v_final_status in ('retry','failed') then p_error else null end
  where id = v_delivery.recipient_id;

  update public.bulk_email_campaigns c
  set total_sent = (select count(*) from public.email_delivery_jobs d where d.campaign_id = c.id and d.status in ('sent','delivered','opened','clicked')),
      total_errors = (select count(*) from public.email_delivery_jobs d where d.campaign_id = c.id and d.status in ('failed','bounced','complained','suppressed'))
  where c.id = v_delivery.campaign_id;

  select count(*) into v_remaining from public.email_delivery_jobs
  where campaign_job_id = v_delivery.campaign_job_id
    and status in ('queued','retry','processing');
  if v_remaining = 0 then
    update public.email_campaign_jobs set status = 'completed', completed_at = now(), updated_at = now()
    where id = v_delivery.campaign_job_id and status <> 'cancelled';
    update public.bulk_email_campaigns set status = 'completed', completed_at = now()
    where id = v_delivery.campaign_id and status <> 'cancelled';
  end if;

  return jsonb_build_object('delivery_id', p_delivery_id, 'status', v_final_status, 'remaining', v_remaining);
end;
$$;

create or replace function public.record_email_delivery_event(
  p_company_id uuid,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery public.email_delivery_jobs%rowtype;
  v_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_delivery from public.email_delivery_jobs
  where company_id = p_company_id and provider_message_id = p_provider_message_id
  order by created_at desc limit 1 for update;

  insert into public.email_delivery_events (
    company_id, delivery_job_id, provider_event_id, provider_message_id, event_type, payload, occurred_at
  ) values (
    p_company_id, v_delivery.id, p_provider_event_id, p_provider_message_id, lower(p_event_type), coalesce(p_payload, '{}'::jsonb), p_occurred_at
  ) on conflict (company_id, provider_event_id) do nothing;

  if v_delivery.id is null then return jsonb_build_object('accepted', true, 'matched', false); end if;
  v_status := case lower(p_event_type)
    when 'delivered' then 'delivered' when 'open' then 'opened' when 'opened' then 'opened'
    when 'click' then 'clicked' when 'clicked' then 'clicked' when 'bounce' then 'bounced'
    when 'bounced' then 'bounced' when 'complaint' then 'complained' else null end;
  if v_status is not null then
    update public.email_delivery_jobs set status = v_status,
      delivered_at = case when v_status = 'delivered' then p_occurred_at else delivered_at end,
      updated_at = now() where id = v_delivery.id;
  end if;
  if v_status in ('bounced','complained') then
    insert into public.email_suppression_list (company_id, email, reason, source, source_event_id)
    values (p_company_id, v_delivery.recipient_email,
      case when v_status = 'bounced' then 'hard_bounce' else 'complaint' end,
      'provider_webhook', p_provider_event_id)
    on conflict (company_id, normalized_email) do update
      set reason = excluded.reason, source = excluded.source,
          source_event_id = excluded.source_event_id, suppressed_at = now();
  end if;
  return jsonb_build_object('accepted', true, 'matched', true, 'delivery_id', v_delivery.id, 'status', v_status);
end;
$$;

revoke all on function public.enqueue_email_campaign(uuid, text, text, text, text, text, text, timestamptz, integer) from public;
grant execute on function public.enqueue_email_campaign(uuid, text, text, text, text, text, text, timestamptz, integer) to authenticated;
revoke all on function public.control_email_campaign(uuid, text) from public;
grant execute on function public.control_email_campaign(uuid, text) to authenticated;
revoke all on function public.claim_email_delivery_jobs(integer) from public;
grant execute on function public.claim_email_delivery_jobs(integer) to service_role;
revoke all on function public.complete_email_delivery(uuid, uuid, text, text, text) from public;
grant execute on function public.complete_email_delivery(uuid, uuid, text, text, text) to service_role;
revoke all on function public.record_email_delivery_event(uuid, text, text, text, jsonb, timestamptz) from public;
grant execute on function public.record_email_delivery_event(uuid, text, text, text, jsonb, timestamptz) to service_role;
