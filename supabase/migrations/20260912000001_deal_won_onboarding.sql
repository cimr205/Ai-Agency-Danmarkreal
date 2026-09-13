-- Phase 2, Flow 3: deal.won -> customer -> onboarding.
--
-- Root problems fixed (confirmed in code before writing this migration):
-- 1. DealsPage.handleStageChange -> useUpdateDeal does a raw
--    `supabase.from('deals').update({stage})`, then unconditionally calls
--    fireWebhookEvent('deal.won', ...) even when the deal was already won
--    (no actual transition happened). Meanwhile trg_emit_deal_event
--    (baseline_functions.sql) independently emits into workspace_events,
--    but only on a real OLD.stage IS DISTINCT FROM NEW.stage change. Result:
--    two uncoordinated deal.won signals today, one of which (the outbound
--    webhook) is not idempotent against a no-op re-save.
-- 2. There is no onboarding mechanism at all: no onboarding_runs table, no
--    task-template concept, nothing consumes workspace_events downstream.
--
-- This migration adds:
-- A. update_deal_stage(...) - a company-scoped, row-locked RPC that is the
--    single trusted place a stage transition happens, and reports whether a
--    real transition occurred so the frontend can stop double-firing the
--    external webhook on no-op re-saves.
-- B. onboarding_templates / onboarding_runs - configurable (per-company,
--    with a global fallback) onboarding checklist, and an exactly-once
--    run record keyed by a UNIQUE (deal_id) so retries/duplicate events
--    can never create duplicate onboarding tasks.
-- C. handle_deal_won_event() - a trigger on workspace_events (the existing
--    event bus, not a new one) that reacts to 'deal.won' and creates the
--    onboarding run + tasks inside the SAME transaction as the deal update
--    (since emit_workspace_event is called synchronously from
--    trg_emit_deal_event), with its own exception guard so an onboarding
--    failure can never roll back the sales-side stage change.

-- ── A. Trusted stage-transition RPC ────────────────────────────────────

create or replace function public.update_deal_stage(p_deal_id uuid, p_stage text)
returns table (
  id uuid,
  company_id uuid,
  title text,
  value numeric,
  stage text,
  customer_id uuid,
  changed boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid := get_user_company_id(auth.uid());
  v_old_stage text;
  v_row public.deals%rowtype;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_stage, '')), '') is null then
    raise exception 'Stage is required' using errcode = '22023';
  end if;

  select d.stage into v_old_stage
  from public.deals d
  where d.id = p_deal_id and d.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Deal not found for this company' using errcode = 'P0002';
  end if;

  update public.deals
  set stage = p_stage
  where deals.id = p_deal_id and deals.company_id = v_company_id
  returning * into v_row;

  return query select
    v_row.id, v_row.company_id, v_row.title, v_row.value, v_row.stage, v_row.customer_id,
    (v_old_stage is distinct from p_stage);
end;
$$;

revoke all on function public.update_deal_stage(uuid, text) from public;
grant execute on function public.update_deal_stage(uuid, text) to authenticated;

-- ── B. Onboarding schema ────────────────────────────────────────────────

create table public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  name text not null default 'Default onboarding',
  is_default boolean not null default false,
  tasks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.onboarding_templates.company_id is
  'NULL = global fallback template, used by any company that has not configured its own default.';
comment on column public.onboarding_templates.tasks is
  'Array of {title, description, due_offset_days} objects, applied relative to the moment the deal is won.';

-- At most one default template per company (and at most one global default).
create unique index onboarding_templates_one_default_per_scope
  on public.onboarding_templates (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_default;

insert into public.onboarding_templates (company_id, name, is_default, tasks) values (
  null, 'Global default onboarding', true,
  '[
    {"title": "Send welcome email", "description": "Introduce the team and outline next steps.", "due_offset_days": 0},
    {"title": "Schedule kickoff call", "description": "Book an onboarding kickoff call with the customer.", "due_offset_days": 2},
    {"title": "Confirm billing details", "description": "Confirm invoicing details and send the first invoice.", "due_offset_days": 3},
    {"title": "Provision access", "description": "Set up the customer's accounts/access to deliverables.", "due_offset_days": 5}
  ]'::jsonb
);

create table public.onboarding_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  deal_id uuid not null unique references public.deals(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  template_id uuid references public.onboarding_templates(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'failed')),
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

comment on constraint onboarding_runs_deal_id_key on public.onboarding_runs is
  'Guarantees deal.won can never create a duplicate onboarding run, however many times the event or a retry fires.';

create index onboarding_runs_company_idx on public.onboarding_runs (company_id);

alter table public.onboarding_templates enable row level security;
alter table public.onboarding_runs enable row level security;

create policy "Company members can view onboarding templates" on public.onboarding_templates
  for select using (company_id is null or company_id = get_user_company_id(auth.uid()));

create policy "Company admins manage onboarding templates" on public.onboarding_templates
  for insert with check (company_id = get_user_company_id(auth.uid()) and is_company_admin(auth.uid()));

create policy "Company admins update onboarding templates" on public.onboarding_templates
  for update using (company_id = get_user_company_id(auth.uid()) and is_company_admin(auth.uid()))
  with check (company_id = get_user_company_id(auth.uid()) and is_company_admin(auth.uid()));

create policy "Company admins delete onboarding templates" on public.onboarding_templates
  for delete using (company_id = get_user_company_id(auth.uid()) and is_company_admin(auth.uid()));

create policy "Company members can view onboarding runs" on public.onboarding_runs
  for select using (company_id = get_user_company_id(auth.uid()));

-- ── C. deal.won consumer ────────────────────────────────────────────────

create or replace function public.handle_deal_won_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_deal public.deals%rowtype;
  v_template_id uuid;
  v_run_id uuid;
  v_task jsonb;
begin
  if NEW.type <> 'deal.won' or NEW.entity_type <> 'deal' then
    return NEW;
  end if;

  begin
    select * into v_deal from public.deals where id = NEW.entity_id::uuid;
    if not found then
      return NEW;
    end if;

    -- Exactly-once: the unique index on deal_id makes this a no-op if an
    -- onboarding run already exists, however many times deal.won fires.
    insert into public.onboarding_runs (company_id, deal_id, customer_id, status)
    values (NEW.company_id, v_deal.id, v_deal.customer_id, 'in_progress')
    on conflict (deal_id) do nothing
    returning id into v_run_id;

    if v_run_id is null then
      return NEW;
    end if;

    if v_deal.customer_id is not null then
      update public.customers
      set status = 'customer'
      where id = v_deal.customer_id
        and record_type = 'customer'
        and status is distinct from 'customer';
    end if;

    select id into v_template_id
    from public.onboarding_templates
    where is_default and (company_id = NEW.company_id or company_id is null)
    order by company_id nulls last
    limit 1;

    update public.onboarding_runs set template_id = v_template_id where id = v_run_id;

    if v_template_id is not null then
      for v_task in
        select * from jsonb_array_elements(
          (select tasks from public.onboarding_templates where id = v_template_id)
        )
      loop
        insert into public.tasks (company_id, title, description, deal_id, due_date, status, created_by)
        values (
          NEW.company_id,
          coalesce(v_task->>'title', 'Onboarding task'),
          v_task->>'description',
          v_deal.id,
          (now() + make_interval(days => coalesce((v_task->>'due_offset_days')::int, 0)))::date,
          'pending',
          v_deal.created_by
        );
      end loop;
    end if;

    update public.onboarding_runs set status = 'completed', completed_at = now() where id = v_run_id;

    perform emit_workspace_event(
      NEW.company_id, 'onboarding.started', 'crm', 'deal', v_deal.id::text,
      jsonb_build_object('onboarding_run_id', v_run_id, 'customer_id', v_deal.customer_id),
      NEW.actor_user_id
    );
  exception when others then
    if v_run_id is not null then
      update public.onboarding_runs set status = 'failed', error = sqlerrm where id = v_run_id;
    end if;
    -- Never let an onboarding failure roll back the deal-won transition itself.
  end;

  return NEW;
end;
$$;

create trigger tr_deal_won_onboarding
after insert on public.workspace_events
for each row execute function public.handle_deal_won_event();
