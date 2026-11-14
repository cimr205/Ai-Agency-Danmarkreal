# Payment integrity audit — AI Agency Danmark

**Priority:** P0. **Status: all four fixes APPLIED and VERIFIED against the dedicated non-production project (`upqzzkdqlaqzgprufzrf`), via `supabase db push`/`db query`. NOT applied to production (`vbxlpxhvojlaisxcipyh`).** Read `docs/qa/CUSTOMER_TO_INVOICE_E2E.md` first.

**2026-11-14, second update — ran it for real.** The user explicitly authorized verification against `upqzzkdqlaqzgprufzrf` this round. Ran `supabase db push --project-ref upqzzkdqlaqzgprufzrf` (confirmed via `supabase migration list` before and after — never used `--linked` without an explicit `--project-ref`, so the CLI's default link to production, restored in the previous round, was never at risk). Found and fixed two more real bugs *by actually running the tests*, not by reading code — see §4b. Final regression run: **PASS**, all 10 scenarios, against a live database. Real two-connection concurrency test: **PASS**. Details below.

**2026-11-14 update:** this session got read-only access to the real production database (`vbxlpxhvojlaisxcipyh`, via the Supabase MCP server — confirmed via `get_project_url`) and used it strictly for inspection (`list_migrations`, `get_advisors`, `pg_proc`/`pg_trigger`/`pg_policies` reads). Two things changed as a result: (1) confirmed directly against production, not inferred, that migration `20261112160000` is genuinely absent from `list_migrations` — the three original gaps are live right now; (2) found a **fourth, more easily reachable gap** while comparing the live function definitions against the advisor output — §4 below. No write of any kind was performed against production in this session.

---

## 1. The vulnerability, precisely

**Attack path:** any authenticated user of a company, calling `supabase.from('payments').insert(...)` directly (bypassing `register_invoice_payment()`), can record more against an invoice than it's worth.

**Reproduction (as a sequence, not yet run against a live database — see §5):**
1. Invoice `OVERPAY-1`, `amount = 1000`, `status = 'sent'`.
2. Direct insert: `payments` row, `amount = 700`, `status = 'completed'`, fresh idempotency key. Accepted — the existing `prevent_payment_after_invoice_settled()` trigger (added `20261014000002`) only checks the invoice's *current* status (`'sent'`, not `'paid'`/`'cancelled'` yet), so it passes.
3. `auto_mark_invoice_paid()` (an `AFTER INSERT` trigger, `20260812000006`) sums payments: 700 < 1000, invoice stays `'sent'`.
4. Second direct insert: another `amount = 700`, different idempotency key. The settled-check trigger again sees `'sent'` (step 3 didn't change it) — accepted.
5. `auto_mark_invoice_paid()` now sums 1400 ≥ 1000 → sets `status = 'paid'`.
6. **Result: invoice shows `'paid'`, payments ledger total is 1400 against a 1000 invoice — a 400 kr (or DKK-equivalent) overstatement with zero error, zero warning.**

**Why the RPC path doesn't have this problem:** `register_invoice_payment()` explicitly computes `v_remaining := v_invoice.amount - v_paid` and raises `22003` if `p_amount > v_remaining`, inside the same transaction that holds `FOR UPDATE` on the invoice row. The direct-insert path never ran that arithmetic — it only had the two narrower guards from `20261005000001` (cross-tenant) and `20261014000002` (already-settled), neither of which sums payments against the still-open balance.

## 2. Every write path into `public.payments`, enumerated

| Path | Who can use it | Goes through `register_invoice_payment`'s checks? | Guarded by this fix? |
|---|---|---|---|
| `useCreatePayment()` → `supabase.rpc('register_invoice_payment', ...)` — the actual UI (`PaymentsPage.tsx`) | any `authenticated` user in the company | Yes, natively | N/A — already safe |
| `register_invoice_payment_service(p_company_id, ...)` — `SECURITY DEFINER`, explicit `p_company_id` param, presumably for a server-side/webhook caller (Stripe-style) | whoever can call it with `service_role` or equivalent elevated context | Yes, natively (same checks, company_id supplied not inferred) | N/A — already safe |
| `supabase.from('payments').insert(...)` direct REST call | any `authenticated` user in the company (RLS: `"Users can create payments in their company"`, `20260812000008`) | **No** | **Yes — this is the fix** |
| `supabase.from('payments').update(...)` direct REST call | any `authenticated` user in the company (RLS: `"Users can update payments in their company"`, no `WITH CHECK`) | No | Yes — the trigger fires on `UPDATE` too |
| Direct `psql`/service-role SQL (migrations, admin tooling, a compromised service-role key) | whoever holds the key / DB access | No — `service_role` bypasses RLS, but **not table triggers** | Yes — triggers run for every role, RLS or no RLS |
| `DELETE` on `payments` | — | — | **Already blocked**: no RLS `DELETE` policy exists for `payments` for `authenticated` at all (checked all migrations touching `public.payments` policies). With RLS enabled and no matching policy, Postgres denies by default. No fix needed. |

**On service-role bypass specifically** (explicitly asked for in the mission): Supabase's `service_role` does bypass Row Level Security, but it does **not** bypass table triggers — `BEFORE`/`AFTER` triggers fire for every writer regardless of role, including superuser-equivalent connections, unless the trigger itself is disabled (`ALTER TABLE ... DISABLE TRIGGER`, a DDL-level action requiring ownership, not just the service-role key). This is exactly why the fix is implemented as a trigger rather than only as an RLS policy tightening: an RLS fix would still leave the service-role path exposed; a trigger does not.

## 3. The fix (one migration, extends an existing function — no new trigger)

File: `supabase/migrations/20261112160000_prevent_direct_insert_payment_overpay.sql`. Extends `prevent_payment_after_invoice_settled()` (already wired to `BEFORE INSERT OR UPDATE ON public.payments` since `20261014000002`) with three additions, all inside the one function so there is still exactly one trigger on this path:

1. **Overpay guard (the headline fix).** Sums existing `completed`, non-`reversed_at` payments for the invoice (excluding the row being written, by `id`), and rejects (`22003`, same code the RPC uses) if adding this payment would exceed `invoices.amount`. Reuses the `FOR UPDATE` lock the existing trigger already takes on the invoice row — that lock is what makes "sum, then compare" safe under real concurrency: a second writer blocks on it until the first commits, so it always sees the first payment in its own sum. No second source of truth for the invoice balance was introduced — it is computed fresh from `payments` + `invoices.amount` every time, exactly like the RPC does.
2. **Zero/negative-amount guard.** The schema-level `payments_amount_nonnegative` check (`20260819000005`) allows `amount = 0`. The RPC separately rejects `amount <= 0` as a parameter check before insert; the direct-insert path had no equivalent. Added `IF NEW.amount <= 0 THEN RAISE EXCEPTION ... END IF;` at the top of the same trigger function, for every status (not only `'completed'`), matching the RPC's own rule and error code (`22023`).
3. **Admin-only reversal.** `reversed_at`/`reversal_reason` (`20260901000004`) had no dedicated RPC and no authorization check at all beyond ordinary company-scoped `UPDATE` RLS — any member, not just an admin, could silently reverse a completed payment, which reduces the sum the new overpay guard relies on. Added a check that a change to either column requires `public.is_company_admin(auth.uid())` or `auth.role() = 'service_role'`, mirroring the existing `"Admins can delete quotes"` / `"Admins can create payroll"` pattern used elsewhere in this schema, raising `42501` otherwise.

No new column, no new table, no change to `register_invoice_payment()`, `register_invoice_payment_service()`, or `auto_mark_invoice_paid()`. This is the minimal extension of the existing enforcement point, per the mission's instruction to widen the existing data model rather than introduce a second one.

**A scoping bug was caught and fixed while writing the regression test, before any execution attempt** — worth stating plainly since it shows the limits of desk-checking without a real database. The first draft ran the settled/overpay check on *every* `UPDATE` of a `'completed'` payment, including a pure reversal edit (only `reversed_at`/`reversal_reason` changing). That meant a legitimate admin reversing a payment that happened to belong to an already-`'paid'` invoice would itself be rejected by the "Invoice is already fully paid" check — the exact test for admin-authorized reversal (§ below) failed against the first draft when traced by hand. Fixed by only running the settled/overpay block when the write actually changes financial facts (`TG_OP = 'INSERT'`, or `status`/`amount`/`invoice_id` changing on an `UPDATE`) — a reversal-only edit now skips it entirely, after the admin check. This also retroactively fixes a latent version of the same bug in the *original* `20261014000002` trigger, which had no such scoping at all (any unrelated `UPDATE` to a completed payment on an already-paid invoice, including the `auto_updated_at` trigger's own touch, would have hit the same false rejection — apparently never triggered in practice because nothing currently updates a settled payment row outside of this new reversal path). This is exactly why §5 rates the fix PLAUSIBLE rather than CONFIRMED: manual tracing caught one real bug already; there could be another that only shows up against a real engine.

## 4. Requirement-by-requirement check (mission §5)

| Requirement | Met by |
|---|---|
| 1. Payment must not exceed remaining balance | New sum-and-compare check, part 1 |
| 2. Concurrent payments serialize correctly | `FOR UPDATE` lock on the invoice row (pre-existing, reused) |
| 3. Invoice locked during the relevant change | Same lock |
| 4. Same payment event not recorded twice | Pre-existing: `payments (company_id, idempotency_key)` unique constraint (`20260901000004`) + RPC idempotent-replay return — unaffected by this fix, still the mechanism for the RPC path. The direct-insert path has no idempotency-key *requirement* (it's nullable at the schema level), which is a separate, narrower gap: a caller using direct insert without supplying an idempotency key gets no replay protection at all. Not fixed in this migration — flagged in §6 as a second, smaller follow-up, because closing it (making the column `NOT NULL` or enforcing it in the trigger) is a slightly larger decision (breaks any existing direct-insert caller that doesn't set one) that deserves its own explicit sign-off rather than bundling into a P0 hotfix. |
| 5. Validation doesn't depend on client data | `company_id` is taken from `auth.uid()` via `get_user_company_id()` inside the RPCs; for the direct-insert path, RLS's `WITH CHECK (company_id = get_user_company_id(auth.uid()))` on `INSERT` already prevents a client from lying about `company_id`, and the cross-tenant trigger (`20261005000001`) independently re-derives it from the invoice row, not from the payment row the client sent |
| 6. `company_id` determined/verified server-side | Same as above |
| 7. Payment status and invoice status stay consistent | `auto_mark_invoice_paid()` (pre-existing) + the new guard preventing the sum from ever exceeding the invoice amount in the first place |
| 8. Negative/zero amounts handled explicitly | Negative: pre-existing CHECK constraint. Zero: new guard, part 2 |
| 9. Changes traceable | Pre-existing `activity_logs` insert inside the RPC path; the direct-insert path has no equivalent audit-log write — not added here (would be a second, separate change to `payments` triggers, not a security fix; flagged in §6) |
| 10. Failed writes roll back the whole transaction | Native Postgres behavior — any `RAISE EXCEPTION` in a `BEFORE` trigger aborts the statement/transaction; nothing partial is left behind |

## 4b. Two more real bugs found only by actually running this (2026-11-14)

Both found by running `supabase db query --linked --project-ref upqzzkdqlaqzgprufzrf -f supabase/tests/prevent_direct_insert_payment_overpay.test.sql` and reading the real error that came back — neither was visible from reading the code.

**Bug A — `public.payments` has no `updated_at` column, but a generic trigger assumes it does.** `trg_auto_updated_at BEFORE UPDATE ON public.payments EXECUTE FUNCTION auto_updated_at()` has existed since the baseline (`20260812000007`) and unconditionally runs `NEW.updated_at = now()`. Confirmed via `information_schema.columns` on both the test project and **production** (read-only) that `payments` never had this column — unlike `invoices`, `deals`, `quotes`, `customers`, which all do. **Any UPDATE to `payments` — not just this session's new reversal feature — has been silently broken in production this whole time**, raising `record "new" has no field "updated_at"`. Fixed in a new migration, `20261114130000_add_payments_updated_at.sql`: adds the column (`timestamptz not null default now()`), backfills existing rows from `created_at`. Applied to the test project; **not yet applied to production**.

**Bug B — my own part-4 fix (fabricated-payment admin gate) conflicted with my own part-1 fix (overpay/settled guard).** `auto_create_payment_on_invoice_paid()` sets `invoices.status = 'paid'` and then inserts the explanatory payment in the same transaction. That INSERT fires `prevent_payment_after_invoice_settled()` on `payments`, which read the invoice's status as already `'paid'` and rejected the very payment meant to explain it (`"Invoice is already fully paid"`). Fixed by replacing the separate status-based "already paid" check with one derived purely from the payments ledger (`other_paid >= invoice_amount`, excluding the row being written) — correct for both cases: a genuine duplicate after real settlement is still rejected (because `other_paid` alone is already ≥ the amount), and the one legitimate explanatory payment is not (because `other_paid` is exactly 0 at that point, by `auto_create_payment_on_invoice_paid`'s own `NOT EXISTS` precondition). Re-ran the full test after this fix: **PASS**.

This is exactly why §5 below distinguishes "reasoned through carefully" from "ran and it worked" — the first draft of this migration was reasoned through carefully and still had two bugs that only running it surfaced.

## 5. What was and wasn't verified, honestly

- **Verified by reading and cross-referencing every migration that touches `public.payments`, `public.invoices`, their RLS policies, and all five relevant RPCs.** Complete static audit, every claim cites a specific migration file.
- **Verified by actual execution, this round:**
  - `scripts/e2e/verify-not-production.mts` run a third time, now pointed at the real `upqzzkdqlaqzgprufzrf` with real production identifiers supplied for comparison → `"verdict": "PASS (distinct from production)"`, exit 0. (Previous round only exercised the refusal paths.)
  - `supabase db push --project-ref upqzzkdqlaqzgprufzrf` — applied all pending migrations including `20261112160000` (four-part fix) and the new `20261114130000` (updated_at fix). Confirmed via `supabase migration list --project-ref upqzzkdqlaqzgprufzrf` before and after.
  - `supabase db query --linked --project-ref upqzzkdqlaqzgprufzrf -f supabase/tests/prevent_direct_insert_payment_overpay.test.sql` → **`pass`**, all 10 scenarios (overpay, zero/negative amount, cross-tenant, idempotent replay, admin-only reversal, admin-only fabricated-payment), after fixing bugs A and B above.
  - **Real two-connection concurrency test:** two separate `supabase db query` CLI invocations, each its own connection, backgrounded and raced (`&` + `wait`) against the same 1000 kr invoice with 700 kr each. One succeeded, one was rejected with `22003`. Final ledger: `payment_count: 1, total_paid: 700.00`. This is the actual race, not two sequential statements.
  - **Tenant isolation, write path:** a second synthetic company/user attempting to insert a payment against the first company's invoice (`company_id` = B, `invoice_id` = A's) was rejected with `42501` by `prevent_cross_tenant_payment_invoice` — confirmed via a live trigger, not RLS (see next point).
  - All synthetic test data (companies, users, customers, invoices, payments) created for these runs was deleted afterward; confirmed via a follow-up query.
- **A real limitation discovered, not assumed:** `supabase db query --linked` connects as Postgres role `postgres` (`current_user = 'postgres'`, `rolbypassrls = true` — checked directly). This means every check above that passed did so via a **trigger** (which fires regardless of role) — never via RLS, which this connection bypasses entirely. The original tenant-isolation test also asserted that company B's `SELECT` on company A's invoice/customer/payments returned zero rows; that assertion was **removed** after discovering the bypass, because a `postgres`-role connection seeing everything is expected behavior, not a finding — asserting on it would have been a false test, not a real one. **RLS `SELECT` policies for tenant isolation remain unverified by live execution** — confirming those requires a real `authenticated`-role session via PostgREST (an anon/publishable key for the test project), which was not available this round either.
- **Verdict on the fix itself: CONFIRMED for the write paths (overpay, zero-amount, admin-reversal, admin-fabrication, cross-tenant-write, concurrency), against a real non-production database.** Still PLAUSIBLE, not CONFIRMED, for RLS-based read isolation specifically, and for anything requiring an authenticated browser session (see `docs/qa/CUSTOMER_TO_INVOICE_E2E.md` for the outstanding browser-E2E gap).

## 4a. Fourth finding — fabricated payment via direct invoice-status update (confirmed live)

Found by cross-checking the Security Advisor's `authenticated_security_definer_function_executable` finding (which lists every `SECURITY DEFINER` function exposed as `/rest/v1/rpc/<name>`, 96 of them) against the live function bodies. One entry, `auto_create_payment_on_invoice_paid()`, turned out to be a trigger (confirmed active on `public.invoices` as `trigger_auto_payment_on_invoice_paid`, `tgenabled = 'O'`) that does this:

```
IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
  IF NOT EXISTS (SELECT 1 FROM payments WHERE invoice_id = NEW.id AND status = 'completed') THEN
    INSERT INTO payments (..., amount, status, payment_method, ...)
    VALUES (..., NEW.amount, 'completed', 'bank_transfer', ...);
  END IF;
END IF;
```

Also confirmed live: `"Users can update invoices in their company"` (RLS, `UPDATE`, role `authenticated`) has `USING (company_id = get_user_company_id(auth.uid()))` and **`with_check: null`** — no restriction at all on which columns or status transitions are allowed. Put together: any authenticated member of a company (not just an admin) can run `supabase.from('invoices').update({status: 'paid'})` directly, and the system will silently fabricate a `'completed'` payment for the full invoice amount with no real payment having occurred.

**Not reachable through the app's own UI today** — checked `src/hooks/api/useFinance.ts`'s `useUpdateInvoiceStatus()` directly: when the target status is `'paid'`, it computes the remaining balance and calls `register_invoice_payment()`, never a raw `invoices` update. Same category as findings 1–3: a direct-REST-bypass of the safe path, not an application bug.

**Fix (same migration, part 4):** `auto_create_payment_on_invoice_paid()` now requires `public.is_company_admin(auth.uid())` or `auth.role() = 'service_role'` before fabricating the payment — raises `42501` otherwise, which aborts the whole `UPDATE ... SET status = 'paid'` statement (the invoice itself does not change status either, so there's no state where the invoice says "paid" but no payment exists). The legitimate `register_invoice_payment()` path is unaffected: it inserts the real payment row *before* updating `invoices.status`, so this trigger's own `NOT EXISTS` check already finds that row and skips fabrication — verified by reading `register_invoice_payment()`'s current production body directly, not assumed from the local migration file.

**Also done (same migration, hardening, matches the advisor's own remediation text verbatim):** `REVOKE EXECUTE ... FROM authenticated, anon, public` on the four trigger functions touched by this fix (`auto_mark_invoice_paid`, `auto_create_payment_on_invoice_paid`, `prevent_payment_after_invoice_settled`, `prevent_cross_tenant_payment_invoice`). These are `RETURNS trigger` functions — Postgres already refuses to execute them outside trigger context, and trigger firing itself does not require `EXECUTE` privilege on the function, so this revoke cannot break the triggers; it only closes the direct-RPC-call surface the advisor flagged.

## 5a. What the live read-only inspection actually covered

Via Supabase MCP against `vbxlpxhvojlaisxcipyh` (confirmed by `get_project_url`), this session read, but did not write: `list_migrations` (125 entries — confirmed `20261112160000` absent), `get_advisors(security)` (6 lint categories, all INFO/WARN, none ERROR — none specific to payment business logic, which a generic linter can't detect), the live `pg_get_functiondef()` of all six payment-adjacent functions, `pg_trigger`/`pg_class`/`pg_proc` for every trigger on `invoices` and `payments`, and `pg_policies` for `invoices`. All SQL was `SELECT`-only; no `apply_migration`, no `execute_sql` with a mutating statement, was run.

## 6. Follow-ups intentionally not bundled into this fix

1. Direct-insert path has no *required* idempotency key (nullable column) — a caller that omits one gets no duplicate-submission protection. Worth closing, but changes behavior for any existing direct-insert caller; needs its own sign-off.
2. Direct-insert path writes no `activity_logs` row (the RPC path does) — an audit-trail gap, not a security hole, since `payments` rows themselves remain the source of truth.
3. `public.leads` is a dead/unused table (noted in `docs/qa/CUSTOMER_TO_INVOICE_E2E.md`) — schema cleanup, unrelated to payments.

None of these block the P0 fix in §3; they're recorded so they aren't silently forgotten.
