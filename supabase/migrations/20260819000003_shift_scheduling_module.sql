-- Shift scheduling module: departments, shifts, shift_applications.
-- Reuses the existing companies/profiles/employee_profiles/user_roles/notifications
-- model instead of introducing a parallel tenant system.

-- ── Permission: who can grant manager permissions to others ────────────────
alter table public.user_roles
  add column if not exists can_grant_permissions boolean not null default false;

-- ── Helper: can this user manage shifts (company_admin/owner or manager)? ──
create or replace function public.can_manage_shifts(_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role in ('system_admin', 'company_admin', 'owner', 'manager')
  )
$$;

-- ── Helper: can this user grant manager permissions to others? ─────────────
create or replace function public.can_grant_shift_permissions(_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and (
        role in ('system_admin', 'company_admin', 'owner')
        or (role = 'manager' and can_grant_permissions = true)
      )
  )
$$;

-- ── departments ──────────────────────────────────────────────────────────
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  color text not null default '#3B82F6',
  emoji text,
  location_type text not null default 'indoor' check (location_type in ('indoor', 'outdoor', 'both')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists departments_company_id_idx on public.departments(company_id);

alter table public.departments enable row level security;

create policy "View departments in own company"
  on public.departments for select
  using (company_id = public.get_user_company_id(auth.uid()));

create policy "Managers can create departments"
  on public.departments for insert
  with check (company_id = public.get_user_company_id(auth.uid()) and public.can_manage_shifts(auth.uid()));

create policy "Managers can update departments"
  on public.departments for update
  using (company_id = public.get_user_company_id(auth.uid()) and public.can_manage_shifts(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()) and public.can_manage_shifts(auth.uid()));

create policy "Managers can delete departments"
  on public.departments for delete
  using (company_id = public.get_user_company_id(auth.uid()) and public.can_manage_shifts(auth.uid()));

-- ── shifts ───────────────────────────────────────────────────────────────
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  assigned_employee_id uuid references public.employee_profiles(id) on delete set null,
  status text not null default 'open' check (status in ('assigned', 'open', 'pending', 'completed')),
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shifts_company_id_idx on public.shifts(company_id);
create index if not exists shifts_shift_date_idx on public.shifts(shift_date);
create index if not exists shifts_assigned_employee_id_idx on public.shifts(assigned_employee_id);

alter table public.shifts enable row level security;

-- Managers/admins see everything in the company. Employees see only their
-- own assigned shifts plus open shifts they could apply to.
create policy "View shifts in own company"
  on public.shifts for select
  using (
    company_id = public.get_user_company_id(auth.uid())
    and (
      public.can_manage_shifts(auth.uid())
      or status = 'open'
      or assigned_employee_id in (
        select id from public.employee_profiles where user_id = auth.uid()
      )
    )
  );

create policy "Managers can create shifts"
  on public.shifts for insert
  with check (
    company_id = public.get_user_company_id(auth.uid())
    and public.can_manage_shifts(auth.uid())
    and created_by = auth.uid()
  );

create policy "Managers can update shifts"
  on public.shifts for update
  using (company_id = public.get_user_company_id(auth.uid()) and public.can_manage_shifts(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()) and public.can_manage_shifts(auth.uid()));

create policy "Managers can delete shifts"
  on public.shifts for delete
  using (company_id = public.get_user_company_id(auth.uid()) and public.can_manage_shifts(auth.uid()));

-- ── shift_applications ───────────────────────────────────────────────────
create table if not exists public.shift_applications (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  applied_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  unique (shift_id, employee_id)
);

create index if not exists shift_applications_shift_id_idx on public.shift_applications(shift_id);
create index if not exists shift_applications_employee_id_idx on public.shift_applications(employee_id);

alter table public.shift_applications enable row level security;

-- Managers see all applications for shifts in their company; employees see
-- only their own applications.
create policy "View shift applications"
  on public.shift_applications for select
  using (
    employee_id in (select id from public.employee_profiles where user_id = auth.uid())
    or shift_id in (
      select id from public.shifts
      where company_id = public.get_user_company_id(auth.uid()) and public.can_manage_shifts(auth.uid())
    )
  );

-- Employees can apply to an open shift in their own company, as themselves.
create policy "Employees can apply to open shifts"
  on public.shift_applications for insert
  with check (
    employee_id in (select id from public.employee_profiles where user_id = auth.uid())
    and shift_id in (
      select id from public.shifts
      where company_id = public.get_user_company_id(auth.uid()) and status = 'open'
    )
  );

-- Only managers/admins can approve/reject (update) applications, scoped to
-- their own company's shifts.
create policy "Managers can review shift applications"
  on public.shift_applications for update
  using (
    shift_id in (
      select id from public.shifts
      where company_id = public.get_user_company_id(auth.uid()) and public.can_manage_shifts(auth.uid())
    )
  )
  with check (
    shift_id in (
      select id from public.shifts
      where company_id = public.get_user_company_id(auth.uid()) and public.can_manage_shifts(auth.uid())
    )
  );

create policy "Employees can withdraw their own pending application"
  on public.shift_applications for delete
  using (
    status = 'pending'
    and employee_id in (select id from public.employee_profiles where user_id = auth.uid())
  );

-- ── updated_at triggers — reuse the existing app-wide trigger function ────
drop trigger if exists departments_set_updated_at on public.departments;
create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.update_updated_at_column();

drop trigger if exists shifts_set_updated_at on public.shifts;
create trigger shifts_set_updated_at
  before update on public.shifts
  for each row execute function public.update_updated_at_column();
