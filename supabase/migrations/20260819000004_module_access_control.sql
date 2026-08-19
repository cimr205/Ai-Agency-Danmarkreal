-- Per-user module visibility control. A row here means the module is
-- BLOCKED for that user (deny-list). No rows = full access — this keeps
-- every existing user unaffected until a company_admin/owner explicitly
-- restricts someone.

create table if not exists public.module_restrictions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module text not null check (module in ('crm', 'marketing', 'finance', 'hr', 'system')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, module)
);

create index if not exists module_restrictions_company_id_idx on public.module_restrictions(company_id);
create index if not exists module_restrictions_user_id_idx on public.module_restrictions(user_id);

alter table public.module_restrictions enable row level security;

-- Users can read their own restrictions (needed for sidebar/route gating).
create policy "Users can view their own module restrictions"
  on public.module_restrictions for select
  using (user_id = auth.uid());

-- Admins can view/manage restrictions for anyone in their company.
create policy "Admins can view module restrictions in their company"
  on public.module_restrictions for select
  using (company_id = public.get_user_company_id(auth.uid()) and public.is_company_admin(auth.uid()));

create policy "Admins can set module restrictions"
  on public.module_restrictions for insert
  with check (
    company_id = public.get_user_company_id(auth.uid())
    and public.is_company_admin(auth.uid())
    and created_by = auth.uid()
  );

create policy "Admins can remove module restrictions"
  on public.module_restrictions for delete
  using (company_id = public.get_user_company_id(auth.uid()) and public.is_company_admin(auth.uid()));
