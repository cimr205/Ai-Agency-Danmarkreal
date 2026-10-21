-- Reconstructed (forward-only) from src/integrations/supabase/types.ts for B2.
-- SOURCE-BASED: production metadata was inaccessible (account lacks query privilege
-- on the production project), so exact SQL types, DEFAULTS, CHECK constraints, indexes,
-- triggers and the ORIGINAL RLS are UNVERIFIED and may differ from production.
-- Tenant RLS below is DESIGNED to the app's standard get_user_company_id(auth.uid()) pattern.
-- These 15 tables are not referenced by committed app code or edge functions (orphaned
-- production tables). Review against a production schema dump before trusting for prod.

do $$
begin
  if to_regclass('public.ai_conversations') is null then
create table if not exists public.ai_conversations (
  company_id uuid not null,
  created_at timestamptz default now() not null,
  id uuid primary key default gen_random_uuid(),
  summary text,
  updated_at timestamptz default now() not null,
  user_id uuid not null,
  foreign key (company_id) references public.companies(id) on delete cascade
);
alter table public.ai_conversations enable row level security;
create policy "Company members access ai_conversations" on public.ai_conversations for all
  using (company_id = public.get_user_company_id(auth.uid()) and user_id = auth.uid())
  with check (company_id = public.get_user_company_id(auth.uid()) and user_id = auth.uid());
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.ai_messages') is null then
create table if not exists public.ai_messages (
  company_id uuid not null,
  content text not null,
  conversation_id uuid not null,
  created_at timestamptz default now() not null,
  id uuid primary key default gen_random_uuid(),
  role text not null,
  user_id uuid not null,
  foreign key (company_id) references public.companies(id) on delete cascade,
  foreign key (conversation_id) references public.ai_conversations(id)
);
alter table public.ai_messages enable row level security;
create policy "Company members access ai_messages" on public.ai_messages for all
  using (company_id = public.get_user_company_id(auth.uid()) and user_id = auth.uid())
  with check (company_id = public.get_user_company_id(auth.uid()) and user_id = auth.uid());
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.ai_execution_runs') is null then
create table if not exists public.ai_execution_runs (
  company_id uuid not null,
  completed_at timestamptz,
  conversation_id uuid,
  id uuid primary key default gen_random_uuid(),
  intent text not null,
  plan jsonb not null,
  started_at timestamptz not null,
  status text not null,
  user_id uuid not null,
  foreign key (company_id) references public.companies(id) on delete cascade,
  foreign key (conversation_id) references public.ai_conversations(id)
);
alter table public.ai_execution_runs enable row level security;
create policy "Company members access ai_execution_runs" on public.ai_execution_runs for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.ai_execution_steps') is null then
create table if not exists public.ai_execution_steps (
  capability text not null,
  created_at timestamptz default now() not null,
  duration_ms numeric,
  error text,
  execution_run_id uuid not null,
  id uuid primary key default gen_random_uuid(),
  input jsonb not null,
  output jsonb,
  provider text not null,
  status text not null,
  foreign key (execution_run_id) references public.ai_execution_runs(id)
);
alter table public.ai_execution_steps enable row level security;
-- NOTE: ai_execution_steps has no company_id column → tenant scoping UNVERIFIED (needs production RLS). RLS enabled with NO policy (deny-all) until reviewed.
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.capability_usage') is null then
create table if not exists public.capability_usage (
  capability_id uuid not null,
  company_id uuid not null,
  execution_count numeric not null,
  failure_count numeric not null,
  id uuid primary key default gen_random_uuid(),
  last_used_at timestamptz,
  module text not null,
  success_count numeric not null,
  updated_at timestamptz default now() not null,
  foreign key (company_id) references public.companies(id) on delete cascade
);
alter table public.capability_usage enable row level security;
create policy "Company members access capability_usage" on public.capability_usage for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.integration_dna') is null then
create table if not exists public.integration_dna (
  broken_chain_count numeric not null,
  capability_count numeric not null,
  company_id uuid not null,
  computed_at timestamptz not null,
  connected_count numeric not null,
  needs_attention_count numeric not null,
  ready_opportunity_count numeric not null,
  score numeric not null,
  unused_capability_count numeric not null,
  used_capability_count numeric not null,
  foreign key (company_id) references public.companies(id) on delete cascade
);
alter table public.integration_dna enable row level security;
create policy "Company members access integration_dna" on public.integration_dna for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.integration_opportunities') is null then
create table if not exists public.integration_opportunities (
  activated_at timestamptz,
  activated_by uuid,
  company_id uuid not null,
  confidence numeric not null,
  created_at timestamptz default now() not null,
  description text not null,
  dismissed_at timestamptz,
  dismissed_by uuid,
  estimated_manual_steps_removed numeric not null,
  id uuid primary key default gen_random_uuid(),
  impacted_modules text[] not null,
  missing_capabilities text[] not null,
  reason text not null,
  required_capabilities text[] not null,
  status text not null,
  title text not null,
  type text not null,
  foreign key (activated_by) references public.profiles(user_id),
  foreign key (company_id) references public.companies(id) on delete cascade,
  foreign key (dismissed_by) references public.profiles(user_id)
);
alter table public.integration_opportunities enable row level security;
create policy "Company members access integration_opportunities" on public.integration_opportunities for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.phone_identities') is null then
create table if not exists public.phone_identities (
  company_id uuid not null,
  created_at timestamptz default now() not null,
  id uuid primary key default gen_random_uuid(),
  last_otp_sent_at timestamptz,
  normalized_number text not null,
  otp_attempts numeric not null,
  otp_code_hash text,
  otp_expires_at timestamptz,
  otp_send_count numeric not null,
  phone_number text not null,
  updated_at timestamptz default now() not null,
  user_id uuid not null,
  verification_status text not null,
  verified_at timestamptz,
  foreign key (company_id) references public.companies(id) on delete cascade,
  foreign key (user_id) references public.profiles(user_id)
);
alter table public.phone_identities enable row level security;
create policy "Company members access phone_identities" on public.phone_identities for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.telephony_connections') is null then
create table if not exists public.telephony_connections (
  capabilities jsonb not null,
  company_id uuid not null,
  created_at timestamptz default now() not null,
  display_number text,
  id uuid primary key default gen_random_uuid(),
  label text,
  normalized_number text,
  phone_identity_id uuid,
  provider_type text not null,
  status text not null,
  updated_at timestamptz default now() not null,
  user_id uuid not null,
  foreign key (company_id) references public.companies(id) on delete cascade,
  foreign key (phone_identity_id) references public.phone_identities(id),
  foreign key (user_id) references public.profiles(user_id)
);
alter table public.telephony_connections enable row level security;
create policy "Company members access telephony_connections" on public.telephony_connections for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.telnyx_config') is null then
create table if not exists public.telnyx_config (
  company_id uuid not null,
  connection_id uuid not null,
  created_at timestamptz default now() not null,
  default_from_number text,
  status text not null,
  updated_at timestamptz default now() not null,
  foreign key (company_id) references public.companies(id) on delete cascade
);
alter table public.telnyx_config enable row level security;
create policy "Company members access telnyx_config" on public.telnyx_config for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.telnyx_credentials') is null then
create table if not exists public.telnyx_credentials (
  company_id uuid not null,
  created_at timestamptz default now() not null,
  id uuid primary key default gen_random_uuid(),
  telnyx_credential_id uuid not null,
  user_id uuid not null,
  foreign key (company_id) references public.companies(id) on delete cascade,
  foreign key (user_id) references public.profiles(user_id)
);
alter table public.telnyx_credentials enable row level security;
create policy "Company members access telnyx_credentials" on public.telnyx_credentials for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.telnyx_webhook_events') is null then
create table if not exists public.telnyx_webhook_events (
  event_id uuid not null,
  received_at timestamptz not null
);
alter table public.telnyx_webhook_events enable row level security;
-- NOTE: telnyx_webhook_events has no company_id column → tenant scoping UNVERIFIED (needs production RLS). RLS enabled with NO policy (deny-all) until reviewed.
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.workspace_ai_preferences') is null then
create table if not exists public.workspace_ai_preferences (
  company_id uuid not null,
  default_email_provider text,
  default_language text,
  updated_at timestamptz default now() not null,
  foreign key (company_id) references public.companies(id) on delete cascade
);
alter table public.workspace_ai_preferences enable row level security;
create policy "Company members access workspace_ai_preferences" on public.workspace_ai_preferences for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.workspace_capabilities') is null then
create table if not exists public.workspace_capabilities (
  capability_id uuid not null,
  company_id uuid not null,
  connection_id uuid,
  discovered_at timestamptz not null,
  id uuid primary key default gen_random_uuid(),
  last_verified_at timestamptz not null,
  provider text not null,
  status text not null,
  foreign key (company_id) references public.companies(id) on delete cascade,
  foreign key (connection_id) references public.integrations(id)
);
alter table public.workspace_capabilities enable row level security;
create policy "Company members access workspace_capabilities" on public.workspace_capabilities for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.call_sessions') is null then
create table if not exists public.call_sessions (
  answered_at timestamptz,
  billable_seconds numeric,
  company_id uuid not null,
  created_at timestamptz default now() not null,
  customer_id uuid,
  destination_country text,
  direction text not null,
  disposition text,
  duration_seconds numeric,
  ended_at timestamptz,
  from_number text,
  id uuid primary key default gen_random_uuid(),
  lead_id uuid,
  metadata jsonb not null,
  notes text,
  provider_call_id uuid,
  provider_cost numeric,
  provider_currency text,
  provider_type text not null,
  ringing_at timestamptz,
  started_at timestamptz not null,
  status text not null,
  telephony_connection_id uuid,
  to_number text,
  updated_at timestamptz default now() not null,
  user_id uuid not null,
  foreign key (company_id) references public.companies(id) on delete cascade,
  foreign key (telephony_connection_id) references public.telephony_connections(id),
  foreign key (user_id) references public.profiles(user_id)
);
alter table public.call_sessions enable row level security;
create policy "Company members access call_sessions" on public.call_sessions for all
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));
  end if;
end;
$$;
