-- user_roles.company_id exists in production but was added directly to the
-- database, never in a migration. accept_invitation (20260922000002) inserts
-- into it and relies on the partial unique index for ON CONFLICT, so fresh
-- builds failed `supabase db lint` with: column "company_id" of relation
-- "user_roles" does not exist.
--
-- Mirrors production exactly; every statement is a no-op where it already exists.

alter table public.user_roles add column if not exists company_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_roles'::regclass and conname = 'user_roles_company_id_fkey'
  ) then
    alter table public.user_roles
      add constraint user_roles_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete cascade;
  end if;
end $$;

create unique index if not exists user_roles_user_company_role_unique
  on public.user_roles using btree (user_id, company_id, role)
  where (company_id is not null);

create index if not exists user_roles_company_idx
  on public.user_roles using btree (company_id, role);
