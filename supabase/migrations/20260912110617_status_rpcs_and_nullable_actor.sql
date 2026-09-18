-- Reconstructed from live production (supabase_migrations.schema_migrations).
-- This migration was applied directly to the database and was missing from
-- git history until this audit found it via `supabase migration list --linked`.
-- Content is verbatim from the live `statements` column; not authored here.

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
