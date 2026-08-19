-- QA finding: negative deal values / invoice amounts could be saved without
-- warning (no validation existed at any layer). UI-level validation can be
-- bypassed by any other client, so enforce it at the database too.
alter table public.deals
  add constraint deals_value_nonnegative check (value >= 0);

alter table public.invoices
  add constraint invoices_amount_nonnegative check (amount >= 0),
  add constraint invoices_subtotal_nonnegative check (subtotal >= 0),
  add constraint invoices_vat_amount_nonnegative check (vat_amount >= 0);

alter table public.payments
  add constraint payments_amount_nonnegative check (amount >= 0);

alter table public.quotes
  add constraint quotes_subtotal_nonnegative check (subtotal >= 0),
  add constraint quotes_vat_amount_nonnegative check (vat_amount >= 0),
  add constraint quotes_total_nonnegative check (total >= 0);
