-- E2E-001 (P0): generate_invoice_number() does SELECT MAX(...)+1 with no
-- locking, and two concurrent invoice-creation requests (RPC call, then a
-- separate INSERT round trip from the frontend — not one transaction, so
-- no in-function advisory lock can span both) can both compute and use
-- the same "next" number. No constraint existed to catch this — it would
-- have silently produced two real invoices sharing one invoice_number.
-- This is the airtight backstop: any race now surfaces as a loud 23505
-- constraint violation the frontend can retry on, instead of silent
-- financial-record corruption.
--
-- Verified zero existing violations before adding (query run first).
alter table public.invoices
  add constraint invoices_company_invoice_number_unique unique (company_id, invoice_number);
