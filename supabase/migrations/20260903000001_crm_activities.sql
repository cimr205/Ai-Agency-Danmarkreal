-- Real CRM activity/follow-up engine. Fills a confirmed gap: activity_logs
-- is audit-log shaped (system events, no per-entity UI), and the client
-- timeline (useClientGraph.ts) currently only synthesizes events from
-- emails/invoices/payments/meetings/deals — there was no way to log a call,
-- a manual note, or set a follow-up date. This table is the source for
-- that "activity" timeline entry kind (already rendered, never populated)
-- and for a "my follow-ups today" view.

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null check (entity_type in ('customer', 'deal')),
  entity_id uuid not null,
  type text not null check (type in (
    'call', 'email_sent', 'email_received', 'meeting', 'note', 'task',
    'status_change', 'deal_stage_change', 'quote_sent', 'quote_accepted',
    'invoice_sent', 'payment_received'
  )),
  body text,
  next_step_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index crm_activities_entity_idx on public.crm_activities (company_id, entity_type, entity_id, created_at desc);
create index crm_activities_followup_idx on public.crm_activities (company_id, next_step_at) where next_step_at is not null and completed_at is null;
create index crm_activities_created_by_idx on public.crm_activities (created_by);

alter table public.crm_activities enable row level security;

create policy "Company members can view activities"
  on public.crm_activities for select
  using (company_id = public.get_user_company_id(auth.uid()));

create policy "Company members can create activities"
  on public.crm_activities for insert
  with check (
    company_id = public.get_user_company_id(auth.uid())
    and created_by = auth.uid()
  );

create policy "Creator or admin can update activities"
  on public.crm_activities for update
  using (
    company_id = public.get_user_company_id(auth.uid())
    and (created_by = auth.uid() or public.is_company_admin(auth.uid()))
  );

create policy "Creator or admin can delete activities"
  on public.crm_activities for delete
  using (
    company_id = public.get_user_company_id(auth.uid())
    and (created_by = auth.uid() or public.is_company_admin(auth.uid()))
  );
