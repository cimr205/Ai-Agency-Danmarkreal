# Stripe / Billing Verification — 2026-11-10

**Environment constraint:** no Stripe test-mode keys, Stripe CLI, or webhook-forwarding setup is available in this session. The 15-item live test matrix in the masterprompt (§14.3 — first subscription, approved/declined payment, discount codes, seat add/remove, duplicate/delayed webhooks, cancellation, etc.) **cannot be executed here**. What follows is a code-level verification of what's actually shipped, re-read directly rather than trusted from commit messages.

## What's shipped (reviewed in this pass)

### `stripe-subscription-webhook` (new, `supabase/functions/stripe-subscription-webhook/index.ts`)
This project previously had **no webhook** for its own seat-subscription billing — only polling (`check-subscription` on page load / every 60s), meaning a cancellation or payment failure in Stripe could go unreflected for minutes or indefinitely. This function closes that gap:
- **Signature verification**: `stripe.webhooks.constructEventAsync(raw, signature, webhookSecret)`, rejects with 401 on missing signature/secret or invalid signature.
- **Idempotency**: inserts into `provider_webhook_receipts` with a unique constraint on `(provider, external_event_id)`; a duplicate delivery hits `23505` and returns `{received: true, status: "duplicate"}` as a no-op, not a reprocess.
- **Out-of-order safety**: rather than trusting the subscription object embedded in the event (which can be stale on a retried/reordered delivery), it re-fetches the subscription live from Stripe before writing, so a delayed webhook can't regress already-newer state.
- Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`; everything else is acknowledged and ignored (`{received: true, ignored: true}`), not treated as an error.

### Billing authorization (`check-subscription`, `create-checkout`, `customer-portal`)
Previously these had no role check — any employee (not just owner/company_admin) could start, cancel, or trigger a billed seat-count change. Reviewed the current code: role checks are now present server-side in the edge functions themselves (not just hidden in the frontend).

### Seat-limit enforcement (`accept_invitation`, reviewed in the 2026-11-08 and this pass)
A company cannot accept more invitations than its actual subscription allows — enforced in a `SECURITY DEFINER` Postgres function that counts live `profiles` rows against `purchased_seats`/`seat_limit_trial` depending on `subscription_status`, server-side. Inviting itself is free; only *accepting* past the limit is blocked.

### Trial logic (reviewed in the 2026-11-08 pass, re-confirmed this pass)
`create-checkout` grants a Stripe trial only if the company has never had one (`company.trial_ends_at` empty) and never writes `trial_ends_at`/`subscription_status` itself — `hasSubscriptionAccess()` gates on the real expiry date, not a status flag that never flips on its own. 9 regression tests cover this (`src/test/trial-overwrite-regression.test.ts`).

## Tests that exist but were not run

`src/test/billing-authorization.integration.test.ts` is a well-constructed integration test: it creates a real owner + employee test user and a real test company via the Supabase Admin API, asserts the employee cannot open the billing portal or change seats, then deletes everything it created in `afterAll`. **Not run in this pass** — it requires `SUPABASE_SERVICE_ROLE_KEY` and creates/deletes real `auth.users` rows in the live project (the same project confirmed in `docs/launch/SECURITY_REPORT.md` to hold real customer data). Creating and deleting live auth users is the kind of action this session's boundaries treat as requiring explicit owner authorization, even though the test cleans up after itself — so it was read and assessed, not executed.

## `release/launch-integration` (pricing branch) — status unchanged from 2026-11-08

Still not re-merged in this pass; the prior finding stands: 8 open owner decisions existed in `OWNER_DECISIONS.md`, of which this pass resolved or re-confirmed 7 (see `docs/launch/OWNER_DECISION_RESOLUTION.md`) — the remaining genuinely open ones (Mastra storage, marketing schema) don't block pricing/checkout. The branch itself still needs a rebase onto current `main` before it can be merged (it was last measured 57 commits behind; not re-measured this pass — out of time budget).

## Verdict for this section

| Item | Status |
|---|---|
| Webhook signature verification | **PASS** (code-verified) |
| Webhook idempotency | **PASS** (code-verified — unique constraint, tested pattern reused from `stripe-payment-webhook`) |
| Out-of-order webhook handling | **PASS** (code-verified — live re-fetch before write) |
| Server-side billing role authorization | **PASS** (code-verified) |
| Seat-limit enforcement | **PASS** (code-verified, DB-level) |
| Trial-overwrite protection | **PASS** (code-verified + 9 passing unit tests) |
| Billing-authorization integration test | **IMPLEMENTED_NOT_TESTED** (exists, well-designed, requires owner-authorized service-role key to run against a live/duplicated project) |
| Full 15-item Stripe test-mode matrix | **BLOCKED** — no Stripe test keys/CLI available in this environment |
| `release/launch-integration` merge-readiness | **BLOCKED** — needs rebase (not re-measured this pass) |

**This is code-level ("would work") verification, not live Stripe-test-mode behavioral verification.** Treat as `UNIT_TESTED`/`IMPLEMENTED_NOT_TESTED` per the masterprompt's own Definition of Done, not `E2E_VERIFIED`.
