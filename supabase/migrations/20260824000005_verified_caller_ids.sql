-- Phase D: per-user Twilio Verified Caller ID for the Power Dialer.
-- An employee proves ownership of their own personal phone number once
-- (Twilio places an automated call, reads a code, they confirm on the
-- call itself — nothing to relay back through our system). Once verified,
-- that number can be used as the outbound caller ID for calls THAT
-- EMPLOYEE places through the Power Dialer, alongside the existing
-- company-purchased Twilio numbers.

create table public.verified_caller_ids (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  phone_number text not null,
  twilio_validation_sid text,
  twilio_caller_id_sid text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, phone_number)
);

create index idx_verified_caller_ids_company on public.verified_caller_ids (company_id);
create index idx_verified_caller_ids_user on public.verified_caller_ids (user_id);

create trigger update_verified_caller_ids_updated_at
  before update on public.verified_caller_ids
  for each row execute function public.update_updated_at_column();

alter table public.verified_caller_ids enable row level security;

create policy "Users can view own verified caller ids, admins view all in company"
  on public.verified_caller_ids
  for select using (
    company_id = get_user_company_id(auth.uid())
    and (user_id = auth.uid() or is_company_admin(auth.uid()))
  );

create policy "Users can create their own verified caller id requests"
  on public.verified_caller_ids
  for insert with check (
    company_id = get_user_company_id(auth.uid())
    and user_id = auth.uid()
  );

create policy "Users can update their own verified caller ids, admins can too"
  on public.verified_caller_ids
  for update using (
    company_id = get_user_company_id(auth.uid())
    and (user_id = auth.uid() or is_company_admin(auth.uid()))
  );

create policy "Users can delete their own verified caller ids, admins can too"
  on public.verified_caller_ids
  for delete using (
    company_id = get_user_company_id(auth.uid())
    and (user_id = auth.uid() or is_company_admin(auth.uid()))
  );
