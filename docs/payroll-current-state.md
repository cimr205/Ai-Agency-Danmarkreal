# Payroll — current state (as of 2026-09-05)

Per explicit instruction: this documents what actually exists, without inventing or implying completeness that isn't there.

## What it is

`Payroll` (HR → Payroll, `src/pages/app/hr/PayrollPage.tsx`) is a **manual gross-salary ledger**, not a payroll processing system. It lets a company member record "employee X was paid Y kr for period Z" and see a running per-month total. That's the entire feature.

## What exists

- Table `payroll`: `id, company_id, employee_profile_id, period (text, e.g. "2026-09"), base_salary, bonus, deductions, net_salary, status, paid_at, created_by, created_at`.
- UI dialog ("Register Payroll"): three inputs — Employee (dropdown), Salary (single number), Period (month picker).
- On submit (`useEmployees.ts` `useCreatePayroll` mutation), the single Salary input is written to **both** `base_salary` and `net_salary`. `bonus` and `deductions` are never set by the UI (left null) despite existing as real columns.
- The page lists all payroll rows for the current period with employee name, salary, period, and totals "Total salary this month" / "Average salary" / "Records" count.

## What does NOT exist

- **No tax or contribution calculation of any kind.** No A-skat (income tax withholding), no AM-bidrag (8% labor market contribution), no ATP, no pension. `net_salary` is a raw copy of the entered gross figure — it is not actually net of anything.
- **No feriepenge (holiday pay) accrual or tracking.**
- **No payslip generation** — no PDF, no employee-facing view of their own payroll history.
- **No SKAT/eIndkomst reporting integration** — nothing is (or could be) reported to Danish tax authorities from this feature.
- **No bank/NETS export** — no file an accountant or bank could use to actually execute the payment; the record is created *after* a payment is presumed to have happened elsewhere.
- **No recurring/scheduled payroll runs** — every period for every employee is entered by hand, one at a time.
- **No connection to `employees`' own salary/contract fields** (if any exist) — the Salary figure is typed fresh each time, not pulled from or reconciled against an employee record.
- `bonus`/`deductions` columns are dead weight: real schema support with zero UI or logic ever populating them.

## Bottom line

This is a bookkeeping convenience for seeing "who got paid what, when" inside the CRM — useful for a founder tracking cash out the door — but it is not, and should not be represented to users as, a real Danish payroll system. A company relying on this for actual payroll compliance (tax withholding, ATP, reporting) would be doing so entirely outside this tool, using this only as an informal log.

## If this needs to become real payroll (not done, not scoped here)

Would need at minimum: Danish tax-bracket/AM-bidrag calculation (or an integration with a real Danish payroll provider — Danløn, Zenegy, Salary, etc. — which is the far more realistic path), ATP handling, feriepenge accrual, payslip PDF generation, and an audit trail suitable for SKAT reporting. This is a multi-week build or a third-party integration, not a bug fix — flagging it as a scoping decision for the user, not attempting it unprompted.
