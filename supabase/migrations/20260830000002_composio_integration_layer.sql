-- Composio-backed multi-tenant integration layer. Reuses the existing
-- `integrations` registry table (company_id, provider, status, metadata,
-- ...) instead of creating a parallel one — Composio's connection identity
-- and auth-config reference just need two more columns. This table remains
-- a registry/authorization layer only: Composio itself is the credential
-- vault, we never store OAuth access tokens here.

alter table public.integrations
  add column if not exists composio_connection_id text,
  add column if not exists composio_auth_config_id text;

create unique index if not exists integrations_composio_connection_unique
  on public.integrations(composio_connection_id)
  where composio_connection_id is not null;

-- Every tool execution through IntegrationService gets logged here,
-- regardless of which provider/toolkit it targeted.
create table public.integration_execution_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  agent_id text,
  integration_id uuid references public.integrations(id) on delete set null,
  provider text not null,
  tool_slug text not null,
  action_category text not null check (action_category in ('read', 'write', 'destructive', 'financial', 'communication')),
  sanitized_input jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'requires_approval')),
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index integration_execution_logs_company_idx on public.integration_execution_logs(company_id, started_at desc);
create index integration_execution_logs_integration_idx on public.integration_execution_logs(integration_id);

alter table public.integration_execution_logs enable row level security;

create policy "Company members can view their execution logs"
  on public.integration_execution_logs
  for select
  using (company_id = get_user_company_id(auth.uid()));

-- Inserts/updates happen only via the service-role edge function
-- (IntegrationService) — no direct client write policy, matching the
-- pattern already used for telnyx_webhook_events.
