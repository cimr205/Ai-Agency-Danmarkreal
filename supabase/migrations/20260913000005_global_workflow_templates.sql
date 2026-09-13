-- Phase 2 follow-up, item 5: global workflow templates A-D.
--
-- Checked workflow-runner before writing this: it only actually executes
-- action_type = 'webhook' (posts to webhook_url) or 'run_integration'
-- (Composio capability + tool slug) — every other action_type hits its
-- "not supported yet" skip branch. Templates below use 'webhook' with
-- webhook_url left null, since we can't know a tenant's real endpoint in
-- advance; instantiating a template gives the tenant a real, editable
-- workflows row they fill the URL into, at which point it actually runs.
--
-- These are genuinely global: workflow_templates has no company_id at
-- all, is read-only to every authenticated user (reference data, not
-- tenant-owned), and instantiate_workflow_template is what COPIES a
-- template into a company's own workflows row — the template itself is
-- never mutated per-tenant and no company's id/config is hardcoded into it.

create table public.workflow_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  trigger_event text not null,
  action_type text not null default 'webhook',
  payload_fields text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.workflow_templates is
  'Global, tenant-agnostic workflow definitions. Not company-scoped by design — instantiate_workflow_template() copies one into a company''s own workflows row, which the company then owns and can edit freely.';

alter table public.workflow_templates enable row level security;

create policy "Any authenticated user can read workflow templates" on public.workflow_templates
  for select to authenticated
  using (true);

insert into public.workflow_templates (key, name, description, trigger_event, action_type, payload_fields) values
  (
    'meta_lead_followup',
    'Meta lead follow-up',
    'Fires on every new lead (lead.created). Note: workflows has no payload-filter concept, so this is not limited to Meta-sourced leads specifically — check payload.lead_source = "meta_ads" on your receiving end if you only want to react to Meta leads. Set a webhook_url after instantiating.',
    'lead.created',
    'webhook',
    array['name', 'email', 'lead_source', 'company']
  ),
  (
    'reply_stops_followup',
    'Reply stops/changes follow-up',
    'Fires when a deterministic reply is detected in an existing email thread (email.replied — see trg_resolve_inbound_email). The matched contact''s pending follow-up reminder is already cleared automatically; this template is for notifying a human or pausing an external sequencing tool. Set a webhook_url after instantiating.',
    'email.replied',
    'webhook',
    array['from_address', 'customer_id', 'deal_id', 'had_pending_followup']
  ),
  (
    'deal_won_onboarding_notify',
    'Deal won -> onboarding notify',
    'Fires when the automatic onboarding pipeline creates an onboarding run for a newly won deal (onboarding.started — see handle_deal_won_event). The onboarding tasks themselves are already created automatically; this template is for notifying a human/Slack/etc. Set a webhook_url after instantiating.',
    'onboarding.started',
    'webhook',
    array['onboarding_run_id', 'customer_id']
  ),
  (
    'payment_success_followup',
    'Payment success follow-up',
    'Fires when an invoice is fully paid (invoice.paid). There is no separate "payment.received" event distinct from this in the current schema. Set a webhook_url after instantiating.',
    'invoice.paid',
    'webhook',
    array['number', 'amount', 'from', 'to']
  );

create or replace function public.instantiate_workflow_template(p_template_key text)
returns table (id uuid, trigger_event text, action_type text, description text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid := get_user_company_id(auth.uid());
  v_template public.workflow_templates%rowtype;
  v_workflow_id uuid;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_template
  from public.workflow_templates
  where key = p_template_key and is_active;

  if not found then
    raise exception 'Workflow template not found' using errcode = 'P0002';
  end if;

  insert into public.workflows (
    company_id, created_by, trigger_event, action_type, payload_fields, description, is_active
  ) values (
    v_company_id, auth.uid(), v_template.trigger_event, v_template.action_type,
    v_template.payload_fields, v_template.name || ' — ' || coalesce(v_template.description, ''), true
  )
  returning workflows.id into v_workflow_id;

  return query select v_workflow_id, v_template.trigger_event, v_template.action_type, v_template.description;
end;
$$;

revoke all on function public.instantiate_workflow_template(text) from public;
grant execute on function public.instantiate_workflow_template(text) to authenticated;
revoke execute on function public.instantiate_workflow_template(text) from anon;
