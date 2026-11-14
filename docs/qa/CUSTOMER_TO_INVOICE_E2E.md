# Customer-to-invoice E2E — verification report

**Mission:** "Fra henvendelse til faktura. Uden at indtaste kunden igen." Verify the lead → customer → deal → invoice → payment flow end to end: code, database, RLS, and (where possible) a running browser.

**Branch:** `feature/dialer-calendar-design-and-errors` (uncommitted — same as the rest of this session's work; nothing committed, nothing else touched).

**Verdict: PARTIAL — updated after a follow-up P0 security session, see §11–§13.** The chain is real, well-engineered, and mostly covered by existing pgTAP tests that were (per their own comments) live-verified against a real session in a prior effort. This session found and fixed one genuine security/data-integrity gap at the code level, but **could not execute any live database test** — neither against production (correctly off-limits) nor against a local stack (environment blocker, see §6). No claim here is a PASS based on code alone; every item below is labeled by its actual evidence level.

**§11–§13 update (same branch, follow-up session):** the overpay gap first flagged here was investigated further and found to be worse than originally scoped (two more related gaps: zero-amount direct inserts, unauthorized direct reversal) — all three are now fixed in the same migration file. A genuine, already-built non-production environment guard was run and proven to work by actual execution. Two separate attempts to stand up a local database both failed on host/Docker environment faults (disk space, then container-registry digest corruption), not on anything related to the fix. **The migration and its tests remain unapplied and unexecuted — verdict is still PARTIAL, not PASS.** Full detail: `docs/security/PAYMENT_INTEGRITY_AUDIT.md`, `docs/qa/PAYMENT_CONCURRENCY_TESTS.md`, `docs/deployment/PAYMENT_MIGRATION_PLAN.md`.

---

## 1. Flow diagram (verified by reading code + migrations, not by running it)

```
LEAD (customers.record_type='lead')
   │  user fills a form → customers INSERT (RLS: company_id = caller's company)
   ▼
convert_lead_to_deal(p_lead_id, p_deal_name, ...)         [SECURITY DEFINER RPC]
   │  one transaction: locks the lead row, finds-or-creates a CUSTOMER by
   │  normalized email/phone (never a duplicate), creates a DEAL linked by
   │  customer_id, marks the lead row converted. Idempotent — a retried
   │  request returns the same ids (dedupe_result: created / matched_existing
   │  / already_converted).
   ▼
CUSTOMER (customers.record_type='customer') ──┬── DEAL (deals.customer_id)
                                               │     stage pipeline via
                                               │     transition_deal_stage()
                                               │     (idempotent; cross-tenant
                                               │     call raises no_data_found)
                                               │
                                               └── QUOTE (quotes.customer_id,
                                                     quotes.deal_id)
                                                     plain INSERT, RLS-gated
                                                     (company_id + created_by
                                                     WITH CHECK) — manual step,
                                                     no pre-fill from the deal
                                                     ▼
                                               quote_to_invoice(quote_id, ...)
                                                     [SECURITY DEFINER RPC]
                                                     ▼
                                               INVOICE (invoices.customer_id,
                                                     invoices.quote_id)
                                                     ▼
                                               register_invoice_payment(
                                                 invoice_id, amount, ...)
                                                     [SECURITY DEFINER RPC]
                                                     locks invoice, checks
                                                     idempotency key, rejects
                                                     overpay, flips status to
                                                     'paid' once fully covered
                                                     ▼
                                               PAYMENT (payments.invoice_id)
```

**Key fact: there is no direct Deal→Invoice link.** A won deal does not carry its value/line items into an invoice automatically. The real path is Deal → (manual) Quote → `quote_to_invoice` RPC → Invoice. The Quote step reuses the **same customer record** (no new customer, no retyped contact details — `quotes.customer_id` is a plain FK into the same `customers` table the CRM uses), but the quote's line items and amount are typed fresh by the user; they are not copied from the deal. This matches what `ConnectedBusiness.tsx` already says ("Fakturaen oprettes manuelt... ingen ny kundeoprettelse") — it does **not** claim deal values carry over, so no copy correction was needed there.

ID model, confirmed from `src/integrations/supabase/types.ts` and the migrations: `customers.id` is the one identity reused by `deals.customer_id`, `quotes.customer_id`, `invoices.customer_id`, and (transitively via `invoices.id`) `payments.invoice_id`. `company_id` is carried independently on every one of these tables and is the tenancy boundary — not derived from any of the above.

**Dead code found, not a functional bug:** a `public.leads` table still exists in the generated types, but no frontend hook (`src/hooks/api/*.ts`) reads or writes it — `useLeads.ts` and everything downstream operate exclusively on `customers` with `record_type='lead'`. Likely a pre-migration remnant from the "merge leads into customers" migration (`20260824000001_merge_leads_into_customers_schema.sql`). Not fixed in this session (out of scope — a schema cleanup, not a functional defect); flagged for a future pass.

---

## 2. What was statically verified (code read in full, cross-checked against each other)

| Step | Mechanism | Idempotent? | Cross-tenant guarded? | Evidence |
|---|---|---|---|---|
| Lead → Customer + Deal | `convert_lead_to_deal` RPC, one transaction, row lock on the lead | Yes — `dedupe_result` returns `already_converted`/`matched_existing` on replay | Yes — `v_company_id` derived from `auth.uid()`, not client input | `supabase/migrations/20260901000001_atomic_lead_conversion.sql`, re-confirmed live per comments in `supabase/tests/convert_lead_to_deal.test.sql` |
| Deal stage transitions | `transition_deal_stage` RPC | Yes (`won_replay` scenario in the pgTAP test) | Yes — cross-workspace call raises `no_data_found` | `supabase/tests/connected_business_flows.test.sql` |
| Quote → Invoice | `quote_to_invoice` RPC, row lock on the quote, rejects a quote already converted | Not re-tested for replay in this session | Yes — `v_company_id` from `auth.uid()` | `supabase/migrations/20260901000004_atomic_finance.sql` |
| Invoice payment (RPC path) | `register_invoice_payment`, row lock on the invoice, required idempotency key, rejects overpay vs. remaining balance, rejects payment on a cancelled/voided invoice | Yes | Yes — cross-workspace call raises `no_data_found` (tested live in `connected_business_flows.test.sql`) | Same files; this is the path the actual UI uses (`useCreatePayment` in `src/hooks/api/useFinance.ts` → `PaymentsPage.tsx`) |
| RLS: customers / deals / invoices / payments / quotes | `SELECT`/`INSERT`/`UPDATE` policies all require `company_id = get_user_company_id(auth.uid())`; `INSERT` policies additionally require `created_by = auth.uid()` where present | — | Yes, at the table level (defense in depth below the RPCs) | `supabase/migrations/20260812000008_baseline_rls_policies.sql` |

All of the above is **code-level verification**, strengthened by the fact that the pgTAP file `supabase/tests/connected_business_flows.test.sql` already exercises this exact chain (Meta lead → contact → deal → won → invoice → payment, including two deliberate cross-tenant attack attempts) and its own header states these checks were run live against a real database in an earlier session. **This session did not re-run that file** (see §6) — its prior-verified status is cited, not re-confirmed.

---

## 3. Bug found and fixed (code-level; migration authored, NOT applied)

**Finding:** `public.payments` grants authenticated users a direct `INSERT` via RLS (`"Users can create payments in their company"`, `20260812000008`) — this is a second write path into the payments table that does **not** go through `register_invoice_payment()`. Two prior migrations already closed two gaps on that same direct-insert path:
- `20261005000001_prevent_cross_tenant_payment_invoice.sql` — a trigger rejecting a payment whose `invoice_id` belongs to a different company than the payment's own `company_id` (found via "live adversarial permission-matrix testing", per its own comment — a real, previously-exploited bug).
- `20261014000002_prevent_duplicate_payment_race.sql` — a trigger rejecting a new `'completed'` payment once the invoice is already `'paid'`/`'cancelled'` (found via "live parallel-request adversarial testing" — 5 concurrent inserts recorded 5× a 1000 kr invoice).

Reading those two alongside `register_invoice_payment()`'s own overpay guard (`p_amount > v_remaining`) surfaced a gap neither prior fix closes: **the direct-insert path has no overpay guard while the invoice is still open.** Two direct inserts of 700 kr each against a 1000 kr `'sent'` invoice are both accepted by the existing "already settled" trigger (the invoice isn't `'paid'` yet when either check runs), and `auto_mark_invoice_paid()` only *sets* `'paid'` once the sum clears the threshold — it never *rejects* the excess. Net effect: invoice ends up `'paid'`, but the payments ledger is inflated 40% beyond the invoice amount, for any caller using the direct REST path instead of the RPC.

**Fix (authored, `supabase/migrations/20261112160000_prevent_direct_insert_payment_overpay.sql`):** extends the existing `prevent_payment_after_invoice_settled()` trigger function (same trigger, no new one) to additionally sum existing completed/non-reversed payments for the invoice (excluding the row being written) and reject if adding the new payment would exceed the invoice amount — mirroring the RPC's own check. The existing `FOR UPDATE` lock on the invoice row in that same trigger is what makes the sum-then-compare safe under real concurrency (a second writer blocks on the lock until the first commits, so it sees the first payment in its own sum).

**Regression test (authored, `supabase/tests/prevent_direct_insert_payment_overpay.test.sql`):** inserts a 700 kr payment directly (bypassing the RPC) against a 1000 kr invoice — must succeed (legitimate partial payment) — then a second direct 700 kr insert — must be rejected with `22003`.

**Status: NOT applied to any database, NOT executed.** Per the mission's own rule ("Du må ikke uden særskilt autorisation: ... gennemføre risikable produktionsmigrationer") and the fact that no safe non-production database was reachable this session (§6), this migration and its test are authored and reviewed but sit unapplied, exactly like the three migrations left similarly unrun in the prior QA session recorded in memory (`qa114-code-fixes`). **This is the single highest-priority item for the owner to run** — against the dedicated non-prod project (`upqzzkdqlaqzgprufzrf`) first, then production, the same path the three earlier payment-hardening migrations presumably took.

No other functional bugs were found or fixed in this session; the rest of the flow (lead conversion, deal transitions, quote conversion) already carries defense-in-depth that reads correctly end to end.

---

## 4. UI / browser verification — honestly limited

- **Public marketing pages** (`/`, `/features`, `/sammenlign`, `/losninger/*`): rendered and screenshotted in this session's prior turns (desktop + mobile), including the `ConnectedBusiness.tsx` section. Still valid — untouched this turn except for the DPA/footer text fix.
- **Authenticated CRM/Finance flow (lead creation → conversion → deal → quote → invoice → payment, in a real logged-in session):** **not exercised this session.** This requires either (a) a real user session against production — explicitly off-limits for creating synthetic test data per the mission's own rules and a documented prior incident (`aiagency-launch` memory: QA "isolated" tenants previously wrote test data straight into production), or (b) a local/non-prod environment, which was attempted and failed (§6).
- `__qa_preview/*` dev-only routes exist (`src/App.tsx`) for several CRM/Finance pages, but they render pages unauthenticated with no company/session context — useful for visual/layout QA, not for exercising the actual data-mutating flow this mission is about. Not used for this report's claims.

**No E2E browser test of the actual customer-to-invoice journey was performed. This is the single biggest verification gap in this report** and the reason the verdict is PARTIAL rather than PASS.

---

## 5. Tenant isolation — evidence level

Not independently re-tested this session. Static RLS policy read (§2 table) confirms every relevant table scopes `SELECT`/`INSERT`/`UPDATE` to `company_id = get_user_company_id(auth.uid())`. The existing `connected_business_flows.test.sql` pgTAP file already encodes a real two-company adversarial test (company B attempting to read company A's Meta account, transition company A's deal, read company A's timeline, and pay company A's invoice — all correctly rejected) and its header states this was live-verified. That file was not re-run this session (§6).

**No new cross-tenant bug was found in `customers`, `deals`, `invoices`, or `quotes`.** The one bug found (§3) is a payments-ledger integrity issue (overpay), not a cross-tenant data leak — the existing cross-tenant trigger on `payments` (`20261005000001`) already closes that angle for the same direct-insert path.

---

## 6. Blocker: no live database was reachable this session

1. **`.env.local` points `VITE_SUPABASE_URL` at the production project** (`vbxlpxhvojlaisxcipyh`), not a test project. Writing synthetic companies/leads/deals/invoices/payments there would pollute production data — explicitly prohibited, and a previously-documented incident (see `aiagency-launch` memory). Not done.
2. **No usable non-production credentials are present in the repo.** `.env.local.prod-backup` points at the dedicated non-prod project (`upqzzkdqlaqzgprufzrf`) but its publishable-key line is empty — incomplete, not usable as-is. `.env.e2e.example` documents the exact env vars a prior session built for this purpose (`TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`, etc.) but none are filled in; `.env.e2e.local` does not exist.
3. **Local Supabase stack (Docker) was attempted and failed for an infrastructure reason, not a policy one:** `colima start` succeeded, but `supabase start` failed pulling container images with `containerd` I/O errors. Root cause: the host disk has only ~2.7 GB free (`df -h /` → 98% used on the data volume) — not enough room for the Supabase image set. Recreating the colima VM larger was not attempted further, since that would consume more of an already near-full disk, which is a worse outcome than stopping and reporting the blocker.
4. **The six previously-skipped Vitest integration tests remain skipped** for the same reason: they require `SUPABASE_SERVICE_ROLE_KEY` against whatever `VITE_SUPABASE_URL` resolves to, which is currently production.

**What would unblock a real PASS:** the owner filling in `.env.e2e.local` (or just a complete, non-empty `.env.local.prod-backup`) with the dedicated non-prod project's keys, and either freeing host disk space for a local Docker-based run or running the pgTAP/Playwright suite against that non-prod project directly via the Supabase CLI (`supabase db query --linked`, after `supabase link --project-ref upqzzkdqlaqzgprufzrf`).

---

## 7. Automated test results (this session, current state)

- `npm run type-check` — clean.
- `npm run lint` — clean.
- `npm run build` — clean (prerender-locales succeeds).
- `npm test -- --run` — **427 passed, 0 failed, 27 skipped** (54 of 60 files; skipped files are the 6 integration suites gated on `SUPABASE_SERVICE_ROLE_KEY`, see §6). Re-run twice this session for consistency; stable both times.
- `supabase/tests/*.sql` (pgTAP, including the two new files from §3) — **not executed**, no reachable database (§6). Reviewed by reading, not run.

---

## 8. Website promise check (`ConnectedBusiness.tsx`)

- Headline **"Fra henvendelse til betalt faktura, uden at genindtaste kunden"** kept as-is. Justification: the mission's instruction is not to use "betalt faktura" unless a complete payment-registration flow is verified — the flow *is* code-complete, RPC-protected, wired to the actual `PaymentsPage.tsx` UI (not a stub), and the exact chain is exercised by the existing `connected_business_flows.test.sql` pgTAP file, whose comments assert prior live verification. What is **not** true is that *this session* re-verified it live in a browser (§4) — that distinction is the reason this report is PARTIAL, not a reason to walk back the headline, which remains the most accurate short claim the code supports.
- Each of the four visible steps is still correctly labeled automatic vs. manual (step 1→2 "Automatisk, ét databasekald"; steps 3, 4 "...manuelt trin") — re-checked against §1/§2 above, still accurate. No copy changes were needed.
- One nuance not shown on the site and not worth adding (would clutter a 4-step diagram): the real path from a won deal to an invoice passes through a **manual Quote step** that is not pre-filled from the deal (§1). The site never claims otherwise — it only claims no *customer* re-entry, which holds — so this was logged here, not published.

---

## 9. Files touched (both sessions, cumulative)

- `supabase/migrations/20261112160000_prevent_direct_insert_payment_overpay.sql` — authored, **extended in the follow-up session** (overpay + zero-amount + admin-only-reversal), **not applied**.
- `supabase/tests/prevent_direct_insert_payment_overpay.test.sql` — authored, **extended** to cover all 10 mission scenarios that can be expressed sequentially, **not executed**.
- `supabase/tests/runtime_payment_overpay_concurrency.sh` — new (follow-up session), real two-connection concurrency test, **not executed**.
- `docs/security/PAYMENT_INTEGRITY_AUDIT.md`, `docs/qa/PAYMENT_CONCURRENCY_TESTS.md`, `docs/deployment/PAYMENT_MIGRATION_PLAN.md` — new (follow-up session).
- `src/components/landing/Footer.tsx`, `src/pages/legal/DataProcessingAgreement.tsx` — "ApS" removed per owner instruction (earlier turn, unrelated to this mission, listed only because `git status` shows them modified in the same uncommitted working tree).
- This file.

No commits were made (none were requested). Nothing was deployed, migrated, or written to any database. Current HEAD at the start of the follow-up session: `962ee48fcc0f109887a362cb6ee60fdb7f29e0d4` on `feature/dialer-calendar-design-and-errors`, unchanged throughout (all work remains uncommitted on top of it).

---

## 10. Conclusion (original session)

**PARTIAL.** The lead-to-payment chain is real, the dangerous paths (cross-tenant access, replay, double-conversion) are guarded by atomic SECURITY DEFINER RPCs with row locks and idempotency keys, and RLS backs every table independently. One genuine gap was found in the direct-insert path around payments and fixed at the code level. But none of this was re-verified live in this session — no browser E2E of the authenticated flow, no executed database test — because the only reachable database is production (correctly untouched) and no local alternative was available (disk space). The fix and its regression test are ready for the owner to apply against the non-prod project and then verify for real.

---

## 11. Follow-up session — is the mandatory Quote step worth removing?

Mission asked for a recommendation between keeping Quote mandatory (current behavior, §1) versus allowing Invoice to be created directly from a Deal, with Quote optional.

- **Datamodel:** `invoices.quote_id` is the only link the schema has from a deal's downstream paperwork to an invoice today; there is no `invoices.deal_id`. Adding Option B cleanly would need either a new nullable `invoices.deal_id` column + a new `deal_to_invoice()` RPC (mirroring `quote_to_invoice()`'s locking/guard pattern), or relaxing `quote_to_invoice` to accept a synthetic quote. Either is a real schema change, not a UI tweak.
- **Accounting correctness:** quotes carry `vat_rate`/`vat_amount`/`subtotal`/`total` computed and (per `quotes_total_nonnegative` etc., `20260819000005`) constrained at the DB level; deals only carry a single `value` number with no VAT breakdown. Skipping the quote means inventing where VAT comes from for a deal-direct invoice — either the user still fills it in at invoice time (in which case the "optional quote" saves exactly one page navigation, not any data entry) or the system guesses a default VAT rate with no basis, which is a worse correctness risk than the one click it removes.
- **Customer workflow:** the actual friction users feel after a won deal is picking the customer and typing line items — and that happens at the Quote step today exactly as it would at a hypothetical direct-Invoice step; Quote is not where the "genindtast kunden" pain the whole mission is about actually lives (§1 already established customer re-entry doesn't happen either way).
- **Implementation cost vs. benefit:** a new RPC, a new nullable FK, new RLS/trigger coverage matching `quote_to_invoice`'s guards (quote-not-already-converted equivalent, company-scoping, row lock), and new tests — for a benefit of skipping one intermediate record that already reuses the same customer and that the business may still want for its own records (a tilbud a customer can see before being invoiced is also a legitimate feature, not just overhead).
- **Risk of duplicates:** a new path means a second way to end up with an invoice for a deal, which is a second place dedupe/idempotency has to be gotten right — directly working against this mission's "ingen dobbeltregistrering" goal if rushed.

**Recommendation: keep Mulighed A (Quote stays as today — effectively mandatory in practice, though nothing stops a one-line quote).** The one-click saving does not justify a new RPC, a new FK, and new attack surface on the exact subsystem this mission just spent its budget hardening. Not implemented. If the owner wants to revisit this, it should be scoped as its own small ticket (new `deals_to_invoice` RPC + migration + tests), not bundled into a payment-security P0.

## 12. Follow-up session — the payments vulnerability, in full

Investigating the overpay gap flagged in §3 (original session) surfaced two more issues in the same code path, all now fixed in the same migration file (still unapplied):

1. **Overpay** (original finding) — direct inserts summed nothing, so two partial payments could together exceed the invoice.
2. **Zero-amount** — the schema `CHECK` only blocks negative amounts; a direct insert of `amount = 0` passed every existing guard.
3. **Unauthorized reversal** — `reversed_at`/`reversal_reason` could be set by any company member via plain `UPDATE`, not just an admin, silently deflating the ledger the overpay guard depends on.

Full writeup, the exact attack sequence, a path-by-path enumeration of every way to write to `public.payments` (including the service-role-bypasses-RLS-but-not-triggers point), and the fix-to-requirement mapping: `docs/security/PAYMENT_INTEGRITY_AUDIT.md`. Full scenario-by-scenario test matrix (10 scenarios from the mission's table, which are real tests vs. which are sequential-only, and why the concurrency case needed a shell script instead of pgTAP): `docs/qa/PAYMENT_CONCURRENCY_TESTS.md`. Step-by-step deploy plan for non-production first, then production with explicit owner gates: `docs/deployment/PAYMENT_MIGRATION_PLAN.md`.

**Environment work actually executed this session (not just read):** `scripts/e2e/verify-not-production.mts` (built in an earlier session) was run twice. With no test credentials set, it correctly refused (`BLOCKED: Missing required test config`, exit 2). With `TEST_SUPABASE_URL` deliberately set to the real production URL and the acknowledgment flag set, it still correctly refused (`BLOCKED: TEST_SUPABASE_URL equals a production Supabase URL`, exit 2). This is real, reproducible proof the non-production gate from mission §7.1 works, obtained by running it, not by reading it.

**Local test environment — two attempts, two different environment failures:**
- Attempt 1: `colima start` + `supabase start` (full stack) → `containerd` I/O errors; host disk was 98% full (~2.7 GB free).
- Attempt 2, after cleanup (disk back to ~6.9 GB free) and starting a lighter stack (`-x imgproxy,studio,logflare,vector,mailpit,edge-runtime,postgres-meta,realtime,supavisor`, keeping only `postgres`/`gotrue`/`postgrest`/`kong`) → a `containerd` content-store digest mismatch pulling `supabase/postgres:17.6.1.155`, identically reproduced across three independent registries (AWS ECR, GHCR, Docker Hub) over three retries each — a local cache-corruption signature, not a network problem.

Both attempts were stopped and cleaned up (`colima delete -f`) rather than forced further. Disk space was left better than found (~3.6 GB free vs. ~2.7 GB at the start of attempt 1).

## 13a. Second follow-up (2026-11-14) — live, read-only production inspection

Got Supabase MCP access to the real production project (`vbxlpxhvojlaisxcipyh`, confirmed via `get_project_url`) this round. Used it **strictly read-only** — `list_migrations`, `get_advisors`, and `SELECT`-only queries against `pg_proc`/`pg_trigger`/`pg_policies`. No write, no `apply_migration`, no test data created.

**Confirmed, not inferred:** migration `20261112160000` is absent from production's 125-entry migration list — the overpay/zero/reversal gaps are live right now, not a stale local worry. `prevent_duplicate_payment_race` (20261014000002) and `prevent_cross_tenant_payment_invoice` (20261005000001), the two prior hardening migrations, ARE present and active (`tgenabled='O'`) in production.

**Fourth gap found, this round, directly from production data (not local migration files):** `auto_create_payment_on_invoice_paid()` — an active trigger on `invoices` — fabricates a full-amount `'completed'` payment the moment `invoices.status` transitions to `'paid'` with no existing payment on record. Combined with the live `"Users can update invoices in their company"` RLS policy (`UPDATE`, any `authenticated` user, no `WITH CHECK`), any company member can fabricate a paid invoice via a direct `invoices.update({status:'paid'})` call. Checked the app code directly: the real UI (`useUpdateInvoiceStatus()`) already routes through `register_invoice_payment()` instead, so this is a direct-API-bypass gap, same class as the other three, not an active app vulnerability. Now gated behind `is_company_admin()`/`service_role` in the same migration (part 4). Full writeup: `docs/security/PAYMENT_INTEGRITY_AUDIT.md` §4a.

Also revoked direct RPC-callability of the four trigger functions involved, matching the Security Advisor's own `authenticated_security_definer_function_executable` / `anon_security_definer_function_executable` findings (WARN-level, 96 functions listed in total — only these four were in scope of this fix).

**(superseded by §14 below, 2026-11-14 third round)**

## 14. Third follow-up (2026-11-14) — applied and verified for real on the non-prod project

The user explicitly authorized verification against `upqzzkdqlaqzgprufzrf` this round. `supabase db push --project-ref upqzzkdqlaqzgprufzrf` / `supabase db query --linked --project-ref upqzzkdqlaqzgprufzrf` worked directly off the already-authenticated CLI session — no `.env.e2e.local`, no anon/service-role key, no local Docker needed after all (the two Docker attempts in §13a turned out to be solving a problem that didn't need solving).

**What's now CONFIRMED, not just reasoned through:**
- The four-part fix (`20261112160000`) is **applied** to `upqzzkdqlaqzgprufzrf`. It is **not** applied to production.
- A **fifth, independent bug** (`payments.updated_at` missing, breaking every UPDATE to that table in production right now, unrelated to this session's fix) was found only by running the test for real, and fixed in a new migration (`20261114130000`), also applied to the test project only.
- A **sixth issue** — a genuine logic conflict between this fix's own part 1 and part 4 — was also found only by running it, and fixed.
- **Full regression suite: PASS**, 10/10 scenarios, against a live database.
- **Real two-connection concurrency race: PASS** — two genuinely concurrent writers, one accepted, one correctly rejected, final ledger exactly 700 (not 1400).
- **Cross-tenant write rejection: PASS**, confirmed live with two synthetic companies.
- **Known, explicit boundary:** everything above was proven via triggers, which fire regardless of role. The CLI connection used (`supabase db query --linked`) runs as Postgres role `postgres` with `rolbypassrls = true` — confirmed directly, not assumed. RLS `SELECT`-based tenant isolation (can company B *read* company A's data) was **not** independently verified this round; that needs a real authenticated REST session, which needs an anon key this round did not retrieve (deliberately — printing a live API key into the transcript without being asked to is exactly the kind of exposure to avoid).
- All synthetic test data was deleted afterward on the test project; confirmed by a follow-up count, not assumed.
- **Browser E2E (priority 3) was not reached** — same underlying gap (no anon key retrieved for this project), now the single remaining blocker rather than one of several.

## 13. Final conclusion (superseded by §15)

(kept for history — see §15 for the current verdict)

## 15. Final conclusion, this round

**PARTIAL.** Upgraded from the previous round's PARTIAL/NO-GO on the strength of real, executed, database-level evidence — but still not PASS, because priority 3 (authenticated browser E2E) was not reached, and RLS-based read isolation specifically remains unverified by live execution (only by code reading).

- **Database-level payment integrity (overpay, zero-amount, admin-only reversal, admin-only fabricated-payment, cross-tenant write, real concurrency): CONFIRMED** on the non-production project, via actual execution, including two additional real bugs this session wouldn't have found any other way.
- **RLS read-isolation, browser E2E, production deployment: still not verified.**
- **NO-GO FOR PRODUCTION as currently configured** — none of today's fixes (the four-part payment-integrity migration, or the newly-found `payments.updated_at` fix) are applied to `vbxlpxhvojlaisxcipyh`. The vulnerabilities described throughout this document are still live in production as of this writing.
- The website's "betalt faktura" headline is left unchanged — it describes the RPC path, which the real UI uses, and that path was never the vulnerable one; this round's testing reinforces rather than undermines that conclusion.

**What's needed for an actual PASS:** (1) re-run the three pre-existing pgTAP files against the test project to rule out regressions in the RPC path, (2) get this project's anon/publishable key through a path the user explicitly authorizes, to run a real browser E2E of the full Lead→Payment flow and to verify RLS read-isolation for real, (3) explicit owner sign-off plus a verified PITR backup before touching production, per `docs/deployment/PAYMENT_MIGRATION_PLAN.md` §5.
