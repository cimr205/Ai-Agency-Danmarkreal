-- Phase B2a step 1: additive column supporting the "convert lead to
-- customer" flow. Conversion creates a NEW customers row
-- (record_type='customer') rather than flipping the original lead row in
-- place, so the original lead's history stays intact and visible in the
-- Leads list. This self-referencing FK links the new customer row back to
-- the lead it came from.

alter table public.customers
  add column converted_from_lead_id uuid references public.customers(id) on delete set null;

create index idx_customers_converted_from_lead on public.customers (converted_from_lead_id);
