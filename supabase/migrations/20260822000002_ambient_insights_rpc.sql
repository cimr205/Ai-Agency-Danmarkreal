-- Audit finding M-01: useAmbientInsights fires on every /app/* route (it
-- backs the always-mounted AmbientInsightsRibbon/ContextPanel) and fetched up
-- to 200 rows each from invoices/deals/customers/tasks just to derive five
-- yes/no/count signals. Past 200 rows the counts silently understate reality.
-- All five signals are pure counts, so compute them server-side instead of
-- shipping rows to the client at all.

create or replace function public.get_ambient_insights()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
  select jsonb_build_object(
    'overdueInvoices', (
      select count(*) from public.invoices
      where status <> 'paid' and due_date is not null and due_date < now()
    ),
    'stalledDeals', (
      select count(*) from public.deals
      where stage not in ('won', 'lost') and updated_at < now() - interval '21 days'
    ),
    'highValueOpenDeals', (
      select count(*) from public.deals
      where stage not in ('won', 'lost') and coalesce(value, 0) > 50000
    ),
    'tasksDueToday', (
      select count(*) from public.tasks
      where status <> 'completed' and due_date is not null and due_date::date = current_date
    ),
    'quietCustomers', (
      select count(*) from public.customers
      where updated_at < now() - interval '30 days'
    )
  );
$function$;

grant execute on function public.get_ambient_insights() to authenticated;
