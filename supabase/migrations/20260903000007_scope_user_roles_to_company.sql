-- Fixes a real structural privilege-escalation gap: user_roles was
-- (user_id, role) only, with no company_id. is_company_admin()/has_role()
-- checked "does this user have this role ANYWHERE", not "for THIS
-- company". A user who was company_admin at Company A, then left and
-- joined Company B as a regular employee, would still pass
-- is_company_admin() checks in Company B's RLS policies (which combine
-- it with "record.company_id = get_user_company_id(auth.uid())" — that
-- part correctly scopes to the CURRENT company, but is_company_admin()
-- itself had no way to know which company the admin role was actually
-- granted for). Becomes actively exploitable the moment a user changes
-- companies without their old role rows being cleaned up — exactly the
-- scenario the invitation system (Phase 2) needs to support.
--
-- Additive, staged migration per the standard here: nullable column,
-- backfill, verify, then constrain. Every existing user_roles row
-- backfills cleanly because every user today belongs to exactly one
-- company (profiles.company_id).

-- 1. Add nullable column.
alter table public.user_roles add column company_id uuid references public.companies(id) on delete cascade;

-- 2. Backfill from the user's current profile. system_admin rows also
-- get backfilled with the granting admin's company for consistency, but
-- the functions below never gate system_admin on company_id — it stays
-- a genuinely global role by design.
update public.user_roles ur
set company_id = p.company_id
from public.profiles p
where p.user_id = ur.user_id and ur.company_id is null;

-- 3/4. Verify, then enforce NOT NULL only if backfill fully succeeded.
-- A hard `alter ... set not null` would abort this whole migration if
-- any orphaned row exists (a user_roles row with no matching profile) —
-- instead, skip the constraint and leave a clear NOTICE for manual
-- follow-up rather than failing the deploy or silently dropping data.
do $$
declare
  orphan_count integer;
begin
  select count(*) into orphan_count from public.user_roles where company_id is null;
  if orphan_count > 0 then
    raise notice 'user_roles: % row(s) have no matching profile and could not be backfilled — company_id left nullable, needs manual review before enforcing NOT NULL', orphan_count;
  else
    alter table public.user_roles alter column company_id set not null;
  end if;
end $$;

-- 5. Replace the old (user_id, role) implicit uniqueness assumption with
-- an explicit one scoped per company — the same user can validly hold
-- different roles in different companies. Partial index so orphaned
-- (still-nullable) rows, if any, don't block this.
create unique index user_roles_user_company_role_unique on public.user_roles (user_id, company_id, role) where company_id is not null;

create index user_roles_company_idx on public.user_roles (company_id, role);

-- 6. The actual fix: company-scope the permission-check functions.
-- system_admin remains intentionally global (platform-wide superuser) —
-- every other role now only counts if it was granted for the user's
-- CURRENT company.
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role = _role
      and (_role = 'system_admin' or company_id = public.get_user_company_id(_user_id))
  )
$function$;

create or replace function public.is_company_admin(_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and (
        role = 'system_admin'
        or (role = 'company_admin' and company_id = public.get_user_company_id(_user_id))
      )
  )
$function$;
