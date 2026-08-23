-- Phase B2a step: repoint get_dashboard_summary() from the standalone
-- public.leads table to the unified public.customers table
-- (record_type = 'lead'), matching the frontend repointing shipping in the
-- same deploy. get_ambient_insights() needs no change — confirmed it never
-- references public.leads.

create or replace function public.get_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
  with
  lead_counts as (
    select
      count(*) as total,
      count(*) filter (where status = 'new') as new,
      count(*) filter (where status = 'contacted') as contacted,
      count(*) filter (where status = 'qualified') as qualified,
      count(*) filter (where created_at >= date_trunc('month', now())) as new_this_month
    from public.customers
    where record_type = 'lead'
  ),
  deal_counts as (
    select
      count(*) as total,
      coalesce(sum(value), 0) as value,
      count(*) filter (where stage = 'won') as won,
      count(*) filter (where stage = 'lost') as lost,
      coalesce(sum(value) filter (where stage = 'won'), 0) as won_value,
      coalesce(sum(value) filter (where stage not in ('won', 'lost')), 0) as open_value
    from public.deals
  ),
  employee_counts as (
    select count(*) as total, count(*) filter (where is_active) as active
    from public.employee_profiles
  ),
  task_counts as (
    select
      count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'completed') as completed,
      count(*) filter (where status = 'in_progress') as in_progress
    from public.tasks
  ),
  email_counts as (
    select count(*) as total, count(*) filter (where is_read = false) as unread
    from public.emails
  ),
  customer_counts as (
    select count(*) as total from public.customers where record_type = 'customer'
  ),
  invoice_counts as (
    select
      count(*) as total,
      count(*) filter (where status = 'paid') as paid,
      count(*) filter (where status <> 'paid' and due_date is not null and due_date < now()) as overdue,
      coalesce(sum(amount), 0) as total_value,
      coalesce(sum(amount) filter (where status <> 'paid' and due_date is not null and due_date < now()), 0) as overdue_value,
      coalesce(sum(amount) filter (where created_at >= date_trunc('month', now())), 0) as month_value,
      coalesce(sum(amount) filter (
        where created_at >= date_trunc('month', now()) - interval '1 month'
          and created_at < date_trunc('month', now())
      ), 0) as last_month_value
    from public.invoices
  ),

  -- Pipeline stages: named stages from pipeline_stages, plus any deal stage
  -- value that has no matching named stage (mirrors the old client fallback).
  pipeline_named_stages as (
    select
      lower(regexp_replace(trim(ps.name), '\s+', '_', 'g')) as key,
      ps.name,
      coalesce(ps.color, '#3B82F6') as color,
      ps.order_index
    from public.pipeline_stages ps
  ),
  deal_stage_values as (
    select distinct
      lower(regexp_replace(trim(d.stage), '\s+', '_', 'g')) as key,
      d.stage as name
    from public.deals d
    where d.stage is not null and trim(d.stage) <> ''
  ),
  combined_stages as (
    select
      coalesce(p.key, ds.key) as key,
      coalesce(p.name, ds.name) as name,
      coalesce(p.color, '#64748B') as color,
      coalesce(p.order_index, 999) as order_index
    from pipeline_named_stages p
    full outer join deal_stage_values ds on ds.key = p.key
  ),
  pipeline_stage_rows as (
    select
      cs.name,
      cs.color,
      (
        select count(*) from public.deals d
        where lower(regexp_replace(trim(d.stage), '\s+', '_', 'g')) = cs.key
      ) as count
    from combined_stages cs
    order by cs.order_index
  ),

  -- Revenue by day, this month, last 8 days with revenue.
  revenue_days as (
    select
      (coalesce(paid_at, created_at))::date as day,
      sum(amount) as value
    from public.invoices
    where created_at >= date_trunc('month', now())
    group by 1
  ),
  revenue_days_recent as (
    select day, value from revenue_days order by day desc limit 8
  ),

  -- 14-day trend buckets for leads / deals / won-value sparklines.
  trend_days as (
    select gs::date as day
    from generate_series(current_date - interval '13 days', current_date, interval '1 day') gs
  ),
  leads_by_day as (
    select created_at::date as day, count(*) as c
    from public.customers
    where record_type = 'lead' and created_at >= current_date - interval '13 days'
    group by 1
  ),
  deals_by_day as (
    select
      created_at::date as day,
      count(*) as c,
      coalesce(sum(value) filter (where stage = 'won'), 0) as won_v
    from public.deals
    where created_at >= current_date - interval '13 days'
    group by 1
  ),

  -- Today's meetings and open tasks (already-bounded lists, unchanged).
  today_meetings as (
    select id, title, start_time, end_time
    from public.calendar_events
    where start_time >= date_trunc('day', now())
      and start_time < date_trunc('day', now()) + interval '1 day'
    order by start_time
    limit 6
  ),
  today_tasks as (
    select id, title, due_date, priority
    from public.tasks
    where status <> 'completed'
    order by due_date asc nulls last
    limit 6
  ),

  -- "Who to talk to" — same inactivity/overdue/value scoring the client used
  -- to compute after fetching up to 300 leads; now scored and top-N'd in SQL
  -- so it's correct no matter how many open leads the company has.
  followup_scored as (
    select
      l.id, l.name, l.company_name, l.status, l.score, l.value,
      greatest(0, floor(extract(epoch from (now() - coalesce(l.last_touched_at, l.created_at))) / 86400))::int as days_since_contact,
      (l.next_followup_at is not null and l.next_followup_at < now()) as overdue,
      (least(greatest(0, floor(extract(epoch from (now() - coalesce(l.last_touched_at, l.created_at))) / 86400))::int, 30) * 2)
        + (case when l.value is not null then least(l.value / 5000.0, 30) else 0 end)
        + (coalesce(l.score, 0) * 1.5)
        + (case when l.next_followup_at is not null and l.next_followup_at < now() then 40 else 0 end)
        as priority
    from public.customers l
    where l.record_type = 'lead' and l.status not in ('customer', 'unqualified')
  ),

  -- "Dagens fokus" — three concrete, actionable feeds (overdue invoices,
  -- deals that have gone quiet, leads that need a call) merged and ranked by
  -- a shared urgency score so the 5 most pressing items surface regardless
  -- of which category they come from. This replaces the old raw activity log.
  focus_invoices as (
    select
      'invoice' as kind, i.id,
      i.invoice_number as label, c.name as company, i.amount,
      greatest(0, floor(extract(epoch from (now() - i.due_date)) / 86400))::int as days,
      null::text as stage, false as overdue,
      (100 + greatest(0, floor(extract(epoch from (now() - i.due_date)) / 86400)) * 2 + least(i.amount / 1000, 50))::numeric as weight
    from public.invoices i
    left join public.customers c on c.id = i.customer_id
    where i.status <> 'paid' and i.due_date is not null and i.due_date < now()
    order by i.due_date asc
    limit 3
  ),
  focus_deals as (
    select
      'deal' as kind, d.id,
      d.title as label, null::text as company, d.value as amount,
      floor(extract(epoch from (now() - d.updated_at)) / 86400)::int as days,
      d.stage, false as overdue,
      (60 + floor(extract(epoch from (now() - d.updated_at)) / 86400) * 1.2 + least(d.value / 2000, 40))::numeric as weight
    from public.deals d
    where d.stage not in ('won', 'lost') and d.updated_at < now() - interval '10 days'
    order by d.updated_at asc
    limit 3
  ),
  focus_leads as (
    select
      'lead' as kind, id,
      name as label, company_name as company, value as amount,
      days_since_contact as days,
      null::text as stage, overdue,
      priority as weight
    from followup_scored
    where overdue or days_since_contact >= 7
    order by priority desc
    limit 3
  ),
  focus_top as (
    select * from (
      select * from focus_invoices
      union all
      select * from focus_deals
      union all
      select * from focus_leads
    ) all_focus
    order by weight desc
    limit 5
  )

  select jsonb_build_object(
    'leads', (select jsonb_build_object('total', total, 'new', new, 'contacted', contacted, 'qualified', qualified, 'newThisMonth', new_this_month) from lead_counts),
    'deals', (select jsonb_build_object('total', total, 'value', value, 'won', won, 'lost', lost, 'wonValue', won_value, 'openValue', open_value) from deal_counts),
    'employees', (select jsonb_build_object('total', total, 'active', active) from employee_counts),
    'tasks', (select jsonb_build_object('pending', pending, 'completed', completed, 'inProgress', in_progress) from task_counts),
    'emails', (select jsonb_build_object('total', total, 'unread', unread) from email_counts),
    'customers', (select jsonb_build_object('total', total) from customer_counts),
    'invoices', (
      select jsonb_build_object(
        'total', total, 'paid', paid, 'overdue', overdue, 'totalValue', total_value,
        'overdueValue', overdue_value, 'monthValue', month_value, 'lastMonthValue', last_month_value
      ) from invoice_counts
    ),
    'pipeline', jsonb_build_object(
      'stages', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'color', color, 'count', count)) from pipeline_stage_rows), '[]'::jsonb)
    ),
    'revenueByDay', coalesce(
      (select jsonb_agg(jsonb_build_object('label', to_char(day, 'DD Mon'), 'value', value) order by day) from revenue_days_recent),
      '[]'::jsonb
    ),
    'trends', jsonb_build_object(
      'leads', (select jsonb_agg(jsonb_build_object('v', coalesce(lbd.c, 0)) order by td.day) from trend_days td left join leads_by_day lbd on lbd.day = td.day),
      'deals', (select jsonb_agg(jsonb_build_object('v', coalesce(dbd.c, 0)) order by td.day) from trend_days td left join deals_by_day dbd on dbd.day = td.day),
      'won', (select jsonb_agg(jsonb_build_object('v', coalesce(dbd.won_v, 0)) order by td.day) from trend_days td left join deals_by_day dbd on dbd.day = td.day)
    ),
    'today', jsonb_build_object(
      'meetings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'start_time', start_time, 'end_time', end_time)) from today_meetings), '[]'::jsonb),
      'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due_date', due_date, 'priority', priority)) from today_tasks), '[]'::jsonb)
    ),
    'followUps', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', id, 'name', name, 'company_name', company_name, 'status', status,
          'score', score, 'value', value, 'days_since_contact', days_since_contact,
          'overdue', overdue, 'priority', priority,
          'reason', case
            when overdue then 'Opfølgning overskredet'
            when days_since_contact >= 14 then days_since_contact || ' dage uden kontakt'
            when value is not null and value >= 50000 then 'Høj dealværdi'
            else days_since_contact || ' dage uden kontakt'
          end
        ) order by priority desc)
        from (select * from followup_scored order by priority desc limit 6) top_followups
      ),
      '[]'::jsonb
    ),
    'focusItems', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'kind', kind, 'id', id, 'label', label, 'company', company, 'amount', amount,
        'days', days, 'stage', stage, 'overdue', overdue
      ) order by weight desc) from focus_top),
      '[]'::jsonb
    )
  );
$function$;

grant execute on function public.get_dashboard_summary() to authenticated;
