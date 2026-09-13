-- Phase 2 follow-up, items 3 and 4.
--
-- (3) lead.updated / task.completed had the same double-fire class of bug
-- as deal.won: useUpdateLead fired 'lead.updated' unconditionally on ANY
-- field edit (not just status), and useUpdateTask fired 'task.completed'
-- whenever the update payload contained status: 'completed', even if the
-- task was already completed (double-click, retry). Same fix as
-- update_deal_stage: a company-scoped, row-locked RPC that compares
-- old/new status server-side and reports whether a real transition
-- happened, so the frontend only fires the outbound webhook on a genuine
-- change.
--
-- (4) ingest_meta_lead and register_invoice_payment_service (previous
-- migrations) fell back to "first company admin found" for created_by when
-- there was no acting user. Checked before writing this: customers.created_by,
-- payments.created_by, and activity_logs.user_id have NO foreign key
-- constraint anywhere in the schema (grepped baseline_constraints_fk.sql) —
-- they're plain `uuid NOT NULL` with nothing to satisfy, so making them
-- nullable and using NULL for system-originated rows is a clean fix with
-- no FK to work around and no frontend read path that assumes non-null
-- (grepped: created_by is only ever written, never joined/displayed).

alter table public.customers alter column created_by drop not null;
alter table public.payments alter column created_by drop not null;
alter table public.activity_logs alter column user_id drop not null;

comment on column public.customers.created_by is
  'Nullable: NULL means the row was created by an automated/system process (e.g. Meta lead ingestion), not a human user.';
comment on column public.payments.created_by is
  'Nullable: NULL means the payment was recorded by an automated/system process (e.g. a Stripe webhook), not a human user.';

create or replace function public.update_lead_status(p_lead_id uuid, p_status public.lead_status)
returns table (
  id uuid,
  company_id uuid,
  name text,
  email text,
  status public.lead_status,
  changed boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid := get_user_company_id(auth.uid());
  v_old_status public.lead_status;
  v_row public.customers%rowtype;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select c.status into v_old_status
  from public.customers c
  where c.id = p_lead_id and c.company_id = v_company_id and c.record_type = 'lead'
  for update;

  if not found then
    raise exception 'Lead not found for this company' using errcode = 'P0002';
  end if;

  update public.customers
  set status = p_status
  where customers.id = p_lead_id and customers.company_id = v_company_id
  returning * into v_row;

  return query select
    v_row.id, v_row.company_id, v_row.name, v_row.email, v_row.status,
    (v_old_status is distinct from p_status);
end;
$$;

revoke all on function public.update_lead_status(uuid, public.lead_status) from public;
grant execute on function public.update_lead_status(uuid, public.lead_status) to authenticated;
revoke execute on function public.update_lead_status(uuid, public.lead_status) from anon;

create or replace function public.update_task_status(p_task_id uuid, p_status public.task_status)
returns table (
  id uuid,
  company_id uuid,
  title text,
  status public.task_status,
  changed boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid := get_user_company_id(auth.uid());
  v_old_status public.task_status;
  v_row public.tasks%rowtype;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select t.status into v_old_status
  from public.tasks t
  where t.id = p_task_id and t.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Task not found for this company' using errcode = 'P0002';
  end if;

  update public.tasks
  set status = p_status,
      completed_at = case when p_status = 'completed' then now() else null end
  where tasks.id = p_task_id and tasks.company_id = v_company_id
  returning * into v_row;

  return query select
    v_row.id, v_row.company_id, v_row.title, v_row.status,
    (v_old_status is distinct from p_status);
end;
$$;

revoke all on function public.update_task_status(uuid, public.task_status) from public;
grant execute on function public.update_task_status(uuid, public.task_status) to authenticated;
revoke execute on function public.update_task_status(uuid, public.task_status) from anon;
