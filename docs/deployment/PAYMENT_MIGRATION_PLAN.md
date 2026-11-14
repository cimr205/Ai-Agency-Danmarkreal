# Safe rollout plan — `20261112160000_prevent_direct_insert_payment_overpay` + `20261114130000_add_payments_updated_at`

**Status (2026-11-14): APPLIED and VERIFIED on the non-production project (`upqzzkdqlaqzgprufzrf`). NOT deployed to production (`vbxlpxhvojlaisxcipyh`).** Section 2–4 below are now checked off for real, with command output to back each one. Section 5 (production) remains a plan, not a log — nothing there is done.

## 0. What this migration does, in one sentence

Extends the existing `prevent_payment_after_invoice_settled()` trigger on `public.payments` to also reject (a) a payment that would push the total paid past the invoice amount, (b) a zero-amount payment, and (c) a non-admin directly setting `reversed_at`/`reversal_reason`. Full detail in `docs/security/PAYMENT_INTEGRITY_AUDIT.md`.

## 1. What actually unblocked this (2026-11-14)

The previous round assumed a `.env.e2e.local` with anon/service-role keys, or a working local Docker stack, were required. Neither turned out to be true: **`supabase db push --project-ref <ref>` and `supabase db query --linked --project-ref <ref>` work directly against any project the logged-in CLI session has access to, with no `.env.e2e.local` and no local database at all** — the CLI was already authenticated (`supabase projects list` showed four projects including `upqzzkdqlaqzgprufzrf`, status `ACTIVE_HEALTHY`). `--project-ref` was passed explicitly on every command; `supabase/config.toml`'s own `project_id` (pointed at production, `vbxlpxhvojlaisxcipyh`, per the previous round's fix) was never touched or relinked, so there was no window where a plain `supabase db push` (no flag) could have hit the wrong project by accident. The two local-Docker attempts recorded below were real, but turned out to be unnecessary — reusing them for the next person's awareness.

**Guard verified for the success path too, this round** (previous round only exercised refusal): `TEST_SUPABASE_URL=https://upqzzkdqlaqzgprufzrf.supabase.co` + `E2E_ALLOW_TEST_PROJECT=1` + real `PROD_SUPABASE_URL`/`PROD_SUPABASE_PROJECT_ID` → `scripts/e2e/verify-not-production.mts` → `"verdict": "PASS (distinct from production)"`, exit 0.

### Historical: the two local-Docker attempts (previous round, not needed in the end)

1. `colima start` + `supabase start` (full stack): failed with `containerd` I/O errors pulling images. Root cause: host disk had ~2.7 GB free at the time (98% full).
2. After freeing space and retrying with a lighter service set: failed differently — a `containerd` content-store digest mismatch pulling `supabase/postgres:17.6.1.155`, reproduced across three registries. A host-side cache-corruption signature, not a network problem.

Both attempts were stopped and cleaned up rather than forced further.

## 2. Pre-deploy checklist (non-production project) — done

- [x] Non-production target identified and double-checked: `upqzzkdqlaqzgprufzrf` ("users", `eu-west-3`, `ACTIVE_HEALTHY`), distinct from `vbxlpxhvojlaisxcipyh` ("crater-crm", production) — confirmed via `supabase projects list`, not assumed.
- [x] `verify-not-production.mts` run with real identifiers on both sides → `PASS (distinct from production)`.
- [x] `supabase migration list --project-ref upqzzkdqlaqzgprufzrf` run before pushing, to see the exact starting state (it was 7 migrations behind, including some unrelated ones from other agents' recent work — `atomic_company_bootstrap`, `invitation_seat_limit`, `onboarding_goal`, `product_events`, `seo_autopilot` ×2 — all pushed together since they were all strictly "pending", none skipped or cherry-picked).

## 3. Apply and test (non-production) — done, with real output

```
$ supabase db push --project-ref upqzzkdqlaqzgprufzrf
Applying migration 20261108144043_atomic_company_bootstrap.sql...
Applying migration 20261108150512_invitation_seat_limit.sql...
Applying migration 20261108152130_onboarding_goal.sql...
Applying migration 20261108154501_product_events.sql...
Applying migration 20261112160000_prevent_direct_insert_payment_overpay.sql...
Applying migration 20261114120000_seo_autopilot.sql...
Applying migration 20261114120100_seo_autopilot_hourly_cron.sql...
{"upToDate":false,"dryRun":false, ...}
```

Running the regression test immediately surfaced two real bugs (full detail in the audit doc §4b) — `payments.updated_at` missing a column a generic trigger assumed existed, and a logic conflict between this fix's own parts 1 and 4. Both fixed (one new migration, `20261114130000_add_payments_updated_at`, applied the same way; one ad-hoc `CREATE OR REPLACE FUNCTION` pushed directly for fast iteration, then captured back into `20261112160000` so the migration file and the deployed function match). Final run:

```
$ supabase db query --linked --project-ref upqzzkdqlaqzgprufzrf -f supabase/tests/prevent_direct_insert_payment_overpay.test.sql
{"rows":[{"pass":"ok 1 - direct-insert payment guards: overpay, zero/negative amount, cross-tenant, idempotent replay, admin-only reversal, admin-only fabricated-payment-on-mark-paid"}]}
```

- [x] Migrations applied without error (after fixing the two bugs above).
- [x] pgTAP file: `pass(...)`, zero exceptions.
- [x] **Real concurrency**, done differently than originally planned (no raw Postgres password was available, so `runtime_payment_overpay_concurrency.sh`'s `psql`-based approach wasn't run as written — instead, two separate `supabase db query` CLI invocations, each its own connection, were backgrounded and raced against the same invoice): one accepted, one rejected `22003`, final ledger `700.00` / 1 row.
- [x] Tenant isolation, write path: a second synthetic company's payment insert against the first company's invoice rejected `42501`.
- [ ] **Not done:** re-running the three pre-existing pgTAP files (`connected_business_flows`, `convert_lead_to_deal`, `backend_epics_e2e`) to confirm no regression in the RPC path. Recommended before this goes anywhere near production — not done this round purely on time, not because it's unimportant.
- [ ] **Not done:** exercising `useCreatePayment()` from the real running app against this project.
- [x] All synthetic test data cleaned up afterward (companies, users, customers, invoices, payments) — confirmed via a follow-up count query, not just "should be fine."
- **Known boundary, not a failure:** `supabase db query --linked` connects as Postgres role `postgres` (`rolbypassrls = true`, confirmed directly) — every check above that passed did so via a trigger, not RLS. RLS `SELECT`-based tenant isolation was **not** verified this round; that needs a real `authenticated`-role session (anon/publishable key + PostgREST), still not available.

## 4. Browser E2E (non-production) — still the part not reached

Still needs a real authenticated browser session against this project's data (or a local dev server pointed at it), which needs at minimum its anon/publishable key — not retrieved this round (`supabase projects api-keys` was available but deliberately not run, since printing live API keys into a transcript without the user naming that specific exposure is exactly the kind of credential materialization to avoid). Run the full scenario from the masterprompt's §9 (Lead → Customer+Deal → Quote → Invoice → two partial Payments → rejected third payment → reload → tenant-isolation repeat as a second company) once that key is available. Record outcomes in `docs/qa/CUSTOMER_TO_INVOICE_E2E.md`, not here.

## 5. Production deployment — requires explicit owner authorization, not performed by this session

- [ ] Owner confirms Supabase PITR (point-in-time recovery) is enabled and a restore has been test-verified (per `aiagency-launch` memory: PITR was still pending owner action as of the last check).
- [ ] Owner reviews this migration's SQL directly (it's short — three `IF` additions to one existing function) and the audit doc, and gives explicit written go-ahead in chat.
- [ ] Deploy via the same path already used for prior production migrations in this project (Supabase MCP or CLI linked to the production ref) — not via this session, and not without the two checkboxes above.
- [ ] Immediately after deploy: run a **read-only** spot check against production — `select count(*) from payments where amount <= 0` (should be 0 already, confirms the new guard didn't need to reject any pre-existing row) and `select invoice_id, sum(amount) from payments where status='completed' and reversed_at is null group by invoice_id having sum(amount) > (select amount from invoices where id = invoice_id)` (should return zero rows — confirms no invoice is *already* overpaid in production; if this returns rows, that is a separate, pre-existing data-integrity incident to triage before or alongside this deploy, not something the migration itself will retroactively fix).
- [ ] Do not mark this "FIXED IN PRODUCTION" anywhere until this section's steps have actually run and their output is pasted into the QA doc.
