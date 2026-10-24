-- LinkedIn outreach queue. Composio's LinkedIn toolkit cannot send connection
-- requests or messages, so outreach is semi-automatic: the app prepares a
-- personalised connection note + follow-up per lead, a human sends it from
-- LinkedIn, and status is tracked here.

create table if not exists public.linkedin_outreach (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_gen_result_id uuid references public.lead_gen_results(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  contact_name text,
  contact_role text,
  company_name text,
  linkedin_url text not null,
  connection_note text,
  followup_message text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'connection_sent', 'connected', 'messaged', 'replied', 'skipped')),
  sent_at timestamptz,
  connected_at timestamptz,
  replied_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint linkedin_outreach_note_len check (connection_note is null or char_length(connection_note) <= 300)
);

create unique index if not exists linkedin_outreach_company_url_unique
  on public.linkedin_outreach(company_id, linkedin_url);
create index if not exists linkedin_outreach_company_status_idx
  on public.linkedin_outreach(company_id, status, created_at desc);

alter table public.linkedin_outreach enable row level security;

drop policy if exists "Company members can view linkedin outreach" on public.linkedin_outreach;
create policy "Company members can view linkedin outreach"
  on public.linkedin_outreach for select
  using (company_id = get_user_company_id(auth.uid()));

drop policy if exists "Company members can update linkedin outreach" on public.linkedin_outreach;
create policy "Company members can update linkedin outreach"
  on public.linkedin_outreach for update
  using (company_id = get_user_company_id(auth.uid()))
  with check (company_id = get_user_company_id(auth.uid()));

drop policy if exists "Company members can delete linkedin outreach" on public.linkedin_outreach;
create policy "Company members can delete linkedin outreach"
  on public.linkedin_outreach for delete
  using (company_id = get_user_company_id(auth.uid()));

-- Inserts happen only through the linkedin-outreach edge function (service role).
