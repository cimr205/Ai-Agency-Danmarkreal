-- Per-company AI provider connection. Each tenant brings their own OpenAI
-- API key (paid for and owned by them) instead of every AI feature sharing
-- one platform-wide key — same "connect once, use everywhere" principle as
-- the Composio integrations layer, but OpenAI isn't a Composio toolkit
-- (it's a raw API key, not an OAuth/data-source account), so this is its
-- own small table + edge function rather than routed through Composio.
create table public.ai_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null default 'openai',
  api_key text not null,
  model text not null default 'gpt-4o-mini',
  status text not null default 'connected' check (status in ('connected', 'error')),
  last_verified_at timestamptz,
  last_error text,
  connected_by uuid references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider)
);

alter table public.ai_connections enable row level security;

-- Only company admins can create/change/remove the connection. Nobody
-- selects raw rows from the frontend even as admin — the api_key only
-- ever leaves the database inside a service-role edge function, and the
-- ai-connection edge function's "status" action never echoes it back.
create policy "Company admins manage ai connections" on public.ai_connections
  as permissive for all to authenticated
  using (company_id = get_user_company_id(auth.uid()) and is_company_admin(auth.uid()))
  with check (company_id = get_user_company_id(auth.uid()) and is_company_admin(auth.uid()));
