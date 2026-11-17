-- Shift-scheduling role checks: tenant scope, self-only, no anonymous execute.
--
-- Before (20260819000003_shift_scheduling_module.sql), both functions were
-- SECURITY DEFINER, executable by PUBLIC/anon, and
--   1. ignored the tenant: a manager/owner/company_admin row for ANY company
--      counted, so a stale or foreign role row granted shift management in the
--      user's current company (the RLS policies only check the row's company,
--      not the company of the role);
--   2. accepted any _user_id, so anyone, including anonymous callers, could
--      probe which roles an arbitrary user holds.
--
-- After:
--   - a role counts only in the user's current company (get_user_company_id),
--     except system_admin, the same rule as public.has_role;
--   - the functions answer only about the caller (_user_id = auth.uid()); RLS
--     always passes auth.uid(), so policies are unchanged;
--   - search_path is empty and every name is schema-qualified;
--   - EXECUTE is revoked from PUBLIC and anon, kept for authenticated (RLS runs
--     as that role) and service_role.
--
-- Used only by RLS on public.departments, public.shifts and
-- public.shift_applications (checked in pg_policies and pg_proc on 2026-11-17:
-- no other function, edge function or frontend code calls them). Production had
-- 0 role rows outside the user's profile company, so no legitimate access changes.
--
-- Rollback: supabase/rollbacks/20261117120000_tenant_scoped_shift_role_checks.down.sql (restores the previous definitions and grants exactly)

create or replace function public.can_manage_shifts(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select _user_id is not null
     and _user_id = auth.uid()
     and exists (
       select 1 from public.user_roles ur
       where ur.user_id = _user_id
         and ur.role in ('system_admin', 'company_admin', 'owner', 'manager')
         and (ur.role = 'system_admin' or ur.company_id = public.get_user_company_id(_user_id))
     )
$$;

create or replace function public.can_grant_shift_permissions(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select _user_id is not null
     and _user_id = auth.uid()
     and exists (
       select 1 from public.user_roles ur
       where ur.user_id = _user_id
         and (
           ur.role in ('system_admin', 'company_admin', 'owner')
           or (ur.role = 'manager' and ur.can_grant_permissions = true)
         )
         and (ur.role = 'system_admin' or ur.company_id = public.get_user_company_id(_user_id))
     )
$$;

revoke all on function public.can_manage_shifts(uuid) from public, anon;
revoke all on function public.can_grant_shift_permissions(uuid) from public, anon;
grant execute on function public.can_manage_shifts(uuid) to authenticated, service_role;
grant execute on function public.can_grant_shift_permissions(uuid) to authenticated, service_role;
