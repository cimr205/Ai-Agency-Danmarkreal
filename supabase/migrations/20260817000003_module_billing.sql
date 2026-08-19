-- Onboarding: capture applicant role and per-module seat allocation.

alter table public.companies
  add column if not exists applicant_role text,
  add column if not exists billing_mode text not null default 'full_suite'
    check (billing_mode in ('full_suite', 'per_module'));

create table if not exists public.company_module_seats (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module text not null check (module in ('crm', 'hr', 'marketing', 'finance')),
  seat_count integer not null check (seat_count >= 0),
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, module)
);

alter table public.company_module_seats enable row level security;

create policy "Company members can view their module seats"
  on public.company_module_seats for select
  using (company_id = public.get_user_company_id(auth.uid()));

create policy "Company admins can manage their module seats"
  on public.company_module_seats for all
  using (company_id = public.get_user_company_id(auth.uid()) and public.is_company_admin(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()) and public.is_company_admin(auth.uid()));
