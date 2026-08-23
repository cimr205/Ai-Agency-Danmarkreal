-- Phase B2a final step: repoint lead_icp_scores.lead_id, quotes.lead_id,
-- and tasks.lead_id from the old public.leads table to the unified
-- public.customers table. Safe now (not in B1) because every lead id that
-- exists in public.leads now also exists as a row in public.customers
-- (record_type='lead') after the backfill that ran immediately before this
-- migration — same ON DELETE behavior preserved for each.
--
-- This also closes the quotes/deals/invoices asymmetry flagged during
-- planning: quotes now references the same unified table deals and
-- invoices already point at, just still via the lead_id column name.

alter table public.lead_icp_scores
  drop constraint lead_icp_scores_lead_id_fkey,
  add constraint lead_icp_scores_lead_id_fkey
    foreign key (lead_id) references public.customers(id) on delete cascade;

alter table public.quotes
  drop constraint quotes_lead_id_fkey,
  add constraint quotes_lead_id_fkey
    foreign key (lead_id) references public.customers(id) on delete set null;

alter table public.tasks
  drop constraint tasks_lead_id_fkey,
  add constraint tasks_lead_id_fkey
    foreign key (lead_id) references public.customers(id) on delete set null;
