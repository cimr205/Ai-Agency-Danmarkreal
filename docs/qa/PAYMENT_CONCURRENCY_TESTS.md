# Payment concurrency & idempotency test matrix

Companion to `docs/security/PAYMENT_INTEGRITY_AUDIT.md`. Covers mission §6's scenario table exactly. **None of these have been executed this session** — no reachable database (see that document's §5, and `docs/deployment/PAYMENT_MIGRATION_PLAN.md`). Every row below states which file covers it and whether it is a real sequential assertion or a genuine concurrency test.

| # | Scenario | Expected | Covered by | Real concurrency? |
|---|---|---|---|---|
| 1 | Invoice 1000, payment 600 | Accepted | `prevent_direct_insert_payment_overpay.test.sql` | No — sequential, doesn't need to be |
| 2 | Same invoice, follow-up payment 400 | Accepted, invoice → `paid` | same file | No |
| 3 | Same invoice, follow-up payment 1 | Rejected (`23505`, already paid) | same file | No |
| 4 | Fresh invoice 1000, single payment 1001 | Rejected (`22003`, exceeds balance) | same file | No |
| 5 | Two simultaneous payments of 700 against one 1000 invoice | At most one accepted | `runtime_payment_overpay_concurrency.sh` | **Yes — two backgrounded `psql` processes racing for real**, not two sequential statements |
| 6 | Same payment request repeated (same idempotency key) | No extra payment row | `prevent_direct_insert_payment_overpay.test.sql`, via `register_invoice_payment()` twice with the same key | No — this is inherently a replay test, not a race; sequential is correct here. The RPC's own idempotency-key unique constraint is what's being exercised |
| 7 | Negative amount | Rejected | same file, `check_violation` on the pre-existing `payments_amount_nonnegative` constraint | No |
| 8 | Zero amount | Rejected | same file, new `22023` guard (this session's fix) | No |
| 9 | Payment on a foreign company's invoice | Rejected | same file, pre-existing `42501` cross-tenant trigger (`20261005000001`) | No |
| 10 | Direct change of payment status/reversal without permission | Rejected | same file, new `42501` admin-only-reversal guard (this session's fix); a company admin performing the same change is also asserted to succeed, so the test proves the check is role-based, not a blanket block | No |

## Scenarios mentioned in the mission but not separately listed above

- **Decimal precision:** `payments.amount` and `invoices.amount` are both `numeric` (arbitrary precision in Postgres) — not floating point — so there is no inherent binary-rounding risk in the sum-and-compare check. Not separately tested this session; would be worth one assertion (e.g. three payments of `333.33` against a `999.99` invoice) if/when the suite is actually run, to confirm `numeric` arithmetic behaves as expected end to end through the trigger, not just in isolation.
- **Cancelled invoice:** covered by the pre-existing `invoice_status = 'cancelled'` branch in the same trigger (`20261014000002`), re-verified by reading, not re-tested — it wasn't touched by this session's change.
- **Already-paid invoice:** scenario #3 above *is* this case (payment 1 after the invoice reached `paid` from 600+400).
- **Failed transactions leaving partial state:** not separately tested; Postgres transactions are atomic by construction — a `RAISE EXCEPTION` inside a `BEFORE` trigger aborts the whole statement. This is a property of the platform, not something this codebase could get wrong without deliberately catching and swallowing the exception, which none of the audited code does.

## Why the concurrency test had to be a shell script, not more pgTAP

A single `psql` session — which is what a `do $$ ... $$` block and pgTAP tests run inside — executes statements one at a time, in order, inside (usually) one transaction. There is no way to make two statements *in the same session* race for a lock the way two independent client connections would. `runtime_payment_overpay_concurrency.sh` follows the existing precedent in this repo (`supabase/tests/runtime_concurrency.sh`, written in an earlier session for a different race condition) of backgrounding two separate `psql` invocations with `&` and `wait`, so they are genuinely concurrent OS processes each holding their own database connection. That script's assertion — `accepted <= 1` and the final ledger sum equals exactly one 700 — is what would actually prove the `FOR UPDATE` lock serializes the two writers correctly, as opposed to both independently passing a check that read a stale, pre-lock snapshot.

## How to actually run these, once a database is reachable

```bash
# 1. Apply the migration (and everything before it) to a dedicated,
#    non-production project — never production directly.
supabase link --project-ref <non-prod-ref>
supabase db push

# 2. Sequential business-rule assertions
supabase db query --linked -f supabase/tests/prevent_direct_insert_payment_overpay.test.sql

# 3. Real concurrency
DATABASE_URL=postgresql://postgres:<password>@<non-prod-host>:5432/postgres \
  ./supabase/tests/runtime_payment_overpay_concurrency.sh
```

Local alternative (what this session attempted and could not complete — see the migration plan doc): `supabase start`, then the same two commands against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
