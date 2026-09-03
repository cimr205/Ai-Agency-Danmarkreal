-- The old (user_id, role) unique constraint predates company-scoped
-- roles and would incorrectly block a user from holding the same role
-- (e.g. 'employee') in two different companies over their lifetime —
-- exactly the scenario the previous migration's company_id column was
-- added to support. Superseded by user_roles_user_company_role_unique.
alter table public.user_roles drop constraint if exists user_roles_user_id_role_key;
