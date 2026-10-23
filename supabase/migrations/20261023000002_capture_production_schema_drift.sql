-- Captures schema changes that were made directly on production and never
-- committed as migrations, so a database built from this repo matches
-- production (and the generated types in src/integrations/supabase/types.ts,
-- which are generated from production). Found by diffing types generated from
-- production against types generated from a fresh `supabase db reset` in CI.
--
-- Every statement mirrors production as read via the Management API on
-- 2026-10-23 and is guarded/idempotent: against production it changes nothing.

-- ── Columns that exist only in production ─────────────────────────────────

alter table public.calendar_events
  add column if not exists related_id uuid,
  add column if not exists related_type text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.calendar_events'::regclass and conname = 'calendar_events_related_type_check') then
    alter table public.calendar_events
      add constraint calendar_events_related_type_check
      check (related_type = any (array['lead'::text, 'customer'::text, 'deal'::text]));
  end if;
end $$;

create index if not exists calendar_events_related_idx
  on public.calendar_events using btree (related_type, related_id)
  where (related_id is not null);

alter table public.companies
  add column if not exists bank_name text,
  add column if not exists bank_reg_number text,
  add column if not exists bank_account_number text,
  add column if not exists iban text,
  add column if not exists swift text,
  add column if not exists payment_reference_note text;

alter table public.oauth_states
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.profiles
  add column if not exists active_phone_connection_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_active_phone_connection_id_fkey') then
    alter table public.profiles
      add constraint profiles_active_phone_connection_id_fkey
      foreign key (active_phone_connection_id) references public.telephony_connections(id) on delete set null;
  end if;
end $$;

-- ── Column defaults that exist only in production ─────────────────────────

alter table public.ai_execution_runs
  alter column plan set default '{}'::jsonb,
  alter column status set default 'executing'::text,
  alter column started_at set default now();

alter table public.ai_execution_steps
  alter column input set default '{}'::jsonb;

alter table public.call_sessions
  alter column direction set default 'outbound'::text,
  alter column status set default 'created'::text,
  alter column started_at set default now(),
  alter column metadata set default '{}'::jsonb;

alter table public.capability_usage
  alter column execution_count set default 0,
  alter column success_count set default 0,
  alter column failure_count set default 0;

alter table public.integration_opportunities
  alter column confidence set default 0.5,
  alter column status set default 'open'::text,
  alter column required_capabilities set default '{}'::text[],
  alter column missing_capabilities set default '{}'::text[],
  alter column impacted_modules set default '{}'::text[],
  alter column estimated_manual_steps_removed set default 0;

alter table public.phone_identities
  alter column otp_attempts set default 0,
  alter column otp_send_count set default 0,
  alter column verification_status set default 'pending'::text;

alter table public.telephony_connections
  alter column capabilities set default '{}'::jsonb,
  alter column status set default 'disconnected'::text;

alter table public.telnyx_webhook_events
  alter column received_at set default now();

alter table public.workspace_capabilities
  alter column status set default 'available'::text,
  alter column discovered_at set default now(),
  alter column last_verified_at set default now();

-- ── integration_dna: integer counters, defaults, one row per company ──────
-- 20261014000000 reconstructed the counters as numeric; production has integer.

do $$
declare col text;
begin
  foreach col in array array['score','connected_count','capability_count','used_capability_count',
    'unused_capability_count','ready_opportunity_count','broken_chain_count','needs_attention_count']
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'public'
        and table_name = 'integration_dna' and column_name = col and data_type = 'numeric') then
      execute format('alter table public.integration_dna alter column %I type integer using %I::integer', col, col);
    end if;
  end loop;
end $$;

alter table public.integration_dna
  alter column score set default 0,
  alter column connected_count set default 0,
  alter column capability_count set default 0,
  alter column used_capability_count set default 0,
  alter column unused_capability_count set default 0,
  alter column ready_opportunity_count set default 0,
  alter column broken_chain_count set default 0,
  alter column needs_attention_count set default 0,
  alter column computed_at set default now();

-- ── telnyx_config ─────────────────────────────────────────────────────────

alter table public.telnyx_config
  alter column status set default 'configuration_error'::text;

-- ── Primary keys and checks on the one-row-per-company tables ─────────────

do $$
declare t text;
begin
  foreach t in array array['integration_dna','telnyx_config','workspace_ai_preferences']
  loop
    if not exists (select 1 from pg_constraint where conrelid = format('public.%I', t)::regclass and contype = 'p') then
      execute format('alter table public.%I add constraint %I primary key (company_id)', t, t || '_pkey');
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conrelid = 'public.integration_dna'::regclass and conname = 'integration_dna_score_check') then
    alter table public.integration_dna add constraint integration_dna_score_check check ((score >= 0) and (score <= 100));
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.telnyx_config'::regclass and conname = 'telnyx_config_status_check') then
    alter table public.telnyx_config add constraint telnyx_config_status_check
      check (status = any (array['ready'::text, 'degraded'::text, 'disconnected'::text, 'auth_error'::text, 'configuration_error'::text]));
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.workspace_ai_preferences'::regclass and conname = 'workspace_ai_preferences_default_language_check') then
    alter table public.workspace_ai_preferences add constraint workspace_ai_preferences_default_language_check
      check (default_language = any (array['da'::text, 'en'::text, 'de'::text]));
  end if;
end $$;

-- ── invitations: raw token column is gone in production ───────────────────
-- 20260922000002 moved invitations to token_hash; production later dropped
-- the raw `token` column and made token_hash required. No function or app
-- code reads invitations.token any more.

alter table public.invitations drop column if exists token;

do $$
begin
  if not exists (select 1 from public.invitations where token_hash is null) then
    alter table public.invitations alter column token_hash set not null;
  end if;
end $$;

-- ── verified_caller_ids was dropped in production ─────────────────────────
-- Not referenced by any function, edge function or frontend code.

drop table if exists public.verified_caller_ids;

-- ── get_company_for_user also returns the company's bank details ──────────
-- Return type changed, so the function must be dropped and recreated.

drop function if exists public.get_company_for_user(uuid);

create function public.get_company_for_user(_company_id uuid)
 returns table(id uuid, name text, cvr text, address text, phone text, email text, website text, logo_url text, industry text, company_size text, status text, mode text, onboarding_completed boolean, onboarding_step integer, compliance_checklist jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, trial_ends_at timestamp with time zone, seat_limit_trial integer, purchased_seats integer, subscription_status text, bank_name text, bank_reg_number text, bank_account_number text, iban text, swift text, payment_reference_note text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
BEGIN
  IF get_user_company_id(auth.uid()) <> _company_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT c.id, c.name, c.cvr, c.address, c.phone, c.email, c.website,
    c.logo_url, c.industry, c.company_size, c.status, c.mode,
    c.onboarding_completed, c.onboarding_step, c.compliance_checklist,
    c.created_at, c.updated_at, c.trial_ends_at, c.seat_limit_trial, c.purchased_seats, c.subscription_status,
    c.bank_name, c.bank_reg_number, c.bank_account_number, c.iban, c.swift, c.payment_reference_note
  FROM public.companies c WHERE c.id = _company_id;
END;
$function$;

grant execute on function public.get_company_for_user(uuid) to anon, authenticated, service_role;
