-- Code review finding: the earlier nonnegative-amount migration
-- (20260819000005) covered deals/invoices/payments/quotes per the QA report
-- that prompted it, but missed payroll — the same unvalidated-negative-money
-- bug class remained exploitable on salary records.
alter table public.payroll
  add constraint payroll_base_salary_nonnegative check (base_salary >= 0),
  add constraint payroll_bonus_nonnegative check (bonus >= 0),
  add constraint payroll_deductions_nonnegative check (deductions >= 0),
  add constraint payroll_net_salary_nonnegative check (net_salary >= 0);
