-- Rollback for 20261117120000_tenant_scoped_shift_role_checks.sql.
-- Restores the definitions and grants that were live in production on 2026-11-17
-- (read from pg_get_functiondef and has_function_privilege before the change).
-- Run in the SQL Editor only if the fix breaks legitimate shift access.

create or replace function public.can_manage_shifts(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role in ('system_admin', 'company_admin', 'owner', 'manager')
  )
$$;

create or replace function public.can_grant_shift_permissions(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and (
        role in ('system_admin', 'company_admin', 'owner')
        or (role = 'manager' and can_grant_permissions = true)
      )
  )
$$;

grant execute on function public.can_manage_shifts(uuid) to public, anon, authenticated, service_role;
grant execute on function public.can_grant_shift_permissions(uuid) to public, anon, authenticated, service_role;
