-- Additive: professional invoice PDFs need real payment instructions
-- (masterprompt §22 "PAYMENT" section) — no bank/IBAN/reference fields
-- existed anywhere in the schema before this.
alter table public.companies
  add column bank_name text,
  add column bank_reg_number text,
  add column bank_account_number text,
  add column iban text,
  add column swift text,
  add column payment_reference_note text;
