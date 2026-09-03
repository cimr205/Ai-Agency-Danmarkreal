-- AI Action Engine (src/ai/ equivalent under supabase/functions/_shared/ai/).
-- Reuses existing tables wherever they already cover the need:
--   - email_accounts / integrations: real connection state — no new
--     "capability_connections" table, would just duplicate them.
--   - user_roles: permission checks (PermissionEngine).
-- New tables are only for what didn't already exist: conversation
-- history, execution run/step logs, and per-workspace AI preferences.
-- No credentials/tokens are ever stored in any of these — only capability
-- ids, inputs/outputs, and status.

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_lookup_idx on public.ai_conversations (company_id, user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at desc);

create table public.ai_execution_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  intent text not null,
  plan jsonb not null default '{}'::jsonb,
  status text not null default 'executing' check (status in ('executing', 'awaiting_confirmation', 'completed', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_execution_runs_company_idx on public.ai_execution_runs (company_id, started_at desc);

create table public.ai_execution_steps (
  id uuid primary key default gen_random_uuid(),
  execution_run_id uuid not null references public.ai_execution_runs(id) on delete cascade,
  capability text not null,
  provider text not null,
  status text not null check (status in ('completed', 'failed', 'requires_confirmation', 'requires_clarification')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index ai_execution_steps_run_idx on public.ai_execution_steps (execution_run_id, created_at);

create table public.workspace_ai_preferences (
  company_id uuid primary key references public.companies(id) on delete cascade,
  default_language text check (default_language in ('da', 'en', 'de')),
  default_email_provider text,
  updated_at timestamptz not null default now()
);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_execution_runs enable row level security;
alter table public.ai_execution_steps enable row level security;
alter table public.workspace_ai_preferences enable row level security;

create policy "Members view own company conversations" on public.ai_conversations
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Members view own company messages" on public.ai_messages
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Members view own company execution runs" on public.ai_execution_runs
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Members view own company execution steps" on public.ai_execution_steps
  for select to authenticated using (
    execution_run_id in (select id from public.ai_execution_runs where company_id = public.get_user_company_id(auth.uid()))
  );
create policy "Members view own company ai preferences" on public.workspace_ai_preferences
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Admins manage own company ai preferences" on public.workspace_ai_preferences
  for all to authenticated
  using (company_id = public.get_user_company_id(auth.uid()) and public.is_company_admin(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()) and public.is_company_admin(auth.uid()));

-- Writes (insert/update) only happen through the service-role AI edge
-- function — never directly from the browser, matching §V/§P. No
-- authenticated-role insert/update policies are defined on purpose.
