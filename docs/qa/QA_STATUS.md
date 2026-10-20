# AI Agency Danmark — QA Autopilot Status

_Autonomous quality system: tests, fixes and hardens the SaaS via real Chrome on localhost._

**Last run:** 2026-10-20 · **Engine:** Playwright 1.64 (real Google Chrome, `channel: "chrome"`) + axe-core
**Overall:** 🟢 **Milestone 1 (manual Lead→…→Payment) VERIFIED.** Public + authenticated finance flows GREEN. ⛔ One pre-existing P1 blocker outside the flow: `npm run type-check` is RED (invitations `token`→`token_hash` drift) — see BLOCKER-TS-001.

---

## Milestone 1 — the complete MANUAL sales flow · ✅ VERIFIED (2026-10-20)

**Lead → Customer → Deal → Quote → Invoice → Payment**, driven end-to-end through the real UI in authenticated Chrome (Tenant A, synthetic data, no real payments). Spec: `tests/e2e/manual-sales-flow.spec.ts` (+ `sales-flow`, `finance-edge`). **11/11 milestone specs pass together** (3.3m).

Acceptance criteria (from /goal §6) — each verified:

| Criterion | Status | Evidence |
|---|---|---|
| Create a lead | ✅ | `crm-crud`, `manual-sales-flow` |
| Register contact / follow-up | ✅ | `LogActivityForm` → persisted (REST-verified) + shown in timeline |
| Convert lead → customer | ✅ | atomic `convert_lead_to_deal` (find-or-create customer, no dup) |
| Create a deal (linked to customer) | ✅ | deal shows the customer; persists after refresh |
| Create a quote with customer data | ✅ | quote linked to the converted lead |
| Accept the quote (authorized transition) | ✅ | draft→sent→accepted (server-enforced `transition_quote`) |
| Convert quote → invoice | ✅ | `quote_to_invoice` resolves the billable customer via the converted lead |
| Register a simulated payment | ✅ | `register_invoice_payment`; invoice flips to **paid** |
| Correct payment status + remaining balance | ✅ | partial payment → not paid, remaining = balance (`finance-edge`) |
| Full history on the customer | ✅ | ClientView ledger+timeline: deal, quote, invoice, payment, lead backlink |
| Refresh without data loss | ✅ | persistence asserted at every hop |
| No re-entry of existing customer data | ✅ | convert reuses the lead's data |
| No duplicate customers/invoices/payments on retry | ✅ | convert idempotent (`already_converted`, 1 customer/1 deal); concurrent payments settle exactly once |
| Critical relations survive refresh | ✅ | Customer↔Deal↔Quote↔Invoice↔Payment |
| Two companies isolated | ✅ | `cross-tenant.spec.ts` (RLS, both tenants) |
| No real payments / sends | ✅ | sandbox data only |

**Regression gates:** `npm run build` ✅ · Playwright milestone suite ✅ 11/11 · `npm run type-check` ❌ (only BLOCKER-TS-001, in the invitations admin pages — **not** on the sales-flow path).

**Next:** Milestone 1 is functionally DONE. Remaining for a fully-green `type-check` gate: resolve BLOCKER-TS-001 (owner: auth/invitations). Then the flow is ready to advance to **AI ASSISTED** (/goal §6, second pass).

---

## Session 2026-10-20 — authenticated finance flows, XSS verification, finance edge cases

Auth was already unblocked in the prior session (isolated `tenantA`/`tenantB` fixtures). Those fixtures' access tokens had expired, but their **refresh tokens are still valid**, so the Supabase client silently re-authenticates on load — verified by the full authed suite passing. **No test accounts were recreated.**

**Baseline (desktop, all specs):** **127 passed · 1 failed** (the 1 failure was the old `sales-flow` part-1 using a non-existent `/app/crm/customers` route — now rewritten; see below). `authed-smoke` (49 routes), `crm-crud`, and `cross-tenant` all passed → fixtures authenticate and cross-tenant RLS still holds.

### ✅ QA-001 — Stored XSS in the email viewer · **VERIFIED FIXED** (real authenticated Chrome)
- New regression spec `tests/e2e/email-xss.spec.ts`. Drives the real `EmailsPage` with a hostile `body_html` (inline `<script>` + `<img onerror>` that try to reach `window.parent`, steal the Supabase session from `localStorage`, and rewrite `document.title`).
- Proven: the `<iframe sandbox="" srcDoc=…>` blocks **script execution**, **parent-DOM/window access**, and **session theft**, while legitimate HTML (headings, bold/italic, links, images) still renders.
- Anti-vacuity: a negative control confirmed the same payload *does* fire when rendered without a sandbox, so the PASS is meaningful.
- Evidence: `docs/qa/evidence/qa-001-xss-sandboxed-viewer.png`.

### ✅ Sales flow — `tests/e2e/sales-flow.spec.ts` (rewritten) · **3/3 PASS**
Exercised through the app's real supported UI paths, each with persistence-after-refresh:
1. **Customer → Deal** — deal created against a real customer (customer_id is required), persists after a full reload.
2. **Quote lifecycle** — draft → sent → accepted via the row actions (server-enforced by `transition_quote`); accepted status persists after refresh.
3. **Invoice → Payment** — invoice created for a customer, full payment registered (`register_invoice_payment`), invoice flips to **paid** and the relation Customer↔Invoice↔Payment holds after refresh.
- Data-model note (verified against SQL): deals require a customer; quotes link a *lead* and only convert to an invoice when they resolve a **billable customer** (`quote_to_invoice` raises *"Quote has no billable customer"* otherwise) — the Quotes create UI only links a lead, so the end-to-end conversion isn't reachable from that screen alone. Captured, not a crash.

### ✅ Finance edge cases — `tests/e2e/finance-edge.spec.ts` · **4/4 PASS**
- **Overpayment** (UI): paying more than the invoice total is rejected; invoice stays unpaid.
- **Non-positive amount** (UI): a negative payment is rejected; invoice stays unpaid.
- **Illegal state transition** (RPC, data-integrity): `transition_quote(draft → accepted)` skipping `sent` is rejected server-side; quote stays `draft`.
- **Concurrency** (RPC): two simultaneous full payments on one invoice settle it **exactly once** (one succeeds, one is rejected as overpayment; `payments` sum == invoice amount; invoice = `paid`). Confirms the `for update` lock + remaining-balance check are atomic.

### ⛔ BLOCKER-TS-001 — `type-check` is RED on the branch (pre-existing, not from this session)
- `npm run type-check` fails with 3 errors in `src/pages/app/admin/AdminUsers.tsx`, `AdminEmployees.tsx`, `src/pages/app/settings/InvitationsPage.tsx`: they `.select('… token …')` / read `inv.token`, but the `invitations` table only exposes **`token_hash`** in the generated types.
- All three files are **unmodified at HEAD (`eeaa028`)** → this landed in a prior branch commit, independent of the current uncommitted redesign and of the QA harness.
- **Runtime impact (P1):** the invitations query selects a non-existent column, so the Settings → Invitations list (and the admin users/employees invite lists) silently fail to load / the copy-invite-link action is broken.
- **Not fixed here on purpose:** a hash can't produce a copyable invite link, so the correct fix is the new one-time-token surfacing flow — a security/product decision in the auth/invitations area another agent is actively reworking. Flagged for that owner. `npm run build` (esbuild, no type-check) still succeeds.

### Verified test totals this session (desktop, real Chrome)
Public baseline **127 passed**; plus rewritten `sales-flow` **3/3**, new `email-xss` **1/1**, new `finance-edge` **4/4**. No weakened assertions; every write targets isolated Tenant A.

---

## Engine

| Piece | State |
|---|---|
| Runner | Playwright, driving **real installed Chrome** (`channel: "chrome"`) — bundled Chromium is unsupported on this macOS 13 host |
| Viewports | desktop 1440×900 · tablet 768×1024 · mobile 390×844 |
| A11y | axe-core (`wcag2a` + `wcag2aa`), fails on **critical** violations |
| Evidence | screenshots + traces on failure (`test-results/`), HTML report (`docs/qa/report/`), JSON (`docs/qa/results.json`) |
| Registry | `tests/e2e/registry.ts` — 7 public + 50 app routes = **57 routes / ~17 modules** |
| Scripts | `qa:smoke` · `qa:full` · `qa:module` (`--grep`) · `qa:report` |

Honesty rule enforced: a route that did not actually run is **NOT_TESTED**, never PASS. No weakened assertions — "it loaded" is not a pass (the smoke asserts the SPA mounted real content, zero console/page errors, and zero critical a11y violations).

---

## Coverage & status

| Module | Routes | Tested | Status | Notes |
|---|---|---|---|---|
| auth (login/signup/forgot/join) | 4 | ✅ render + a11y (desktop) | **PASS** | after BUG-001 fix |
| legal (privacy/terms/dpa) | 3 | ✅ render + a11y (desktop) | **PASS** | |
| security (anonymous URL access) | 50 app routes | ✅ desktop | **PASS** | all 50 redirect to login — no leakage |
| dashboard, crm, finance, hr, work, email, marketing, ai, automation, workspace, settings, system, onboarding, admin | 50 | ❌ | **BLOCKED** | needs test credentials — see Blockers |
| Responsive — public (tablet+mobile) | 7 | ✅ | **PASS** | render + a11y green on 768×1024 and 390×844 |

**Verified test totals:** **104 passing · 0 failing** · build ✅ · typecheck ✅.
Breakdown: public smoke render+a11y (desktop 14 · tablet 14 · mobile 14) · security anonymous access-control 50 · auth login behaviour 1 · keyboard 1 · form validation 5 · 404 handling 1 · i18n da/de 2 · API-failure resilience 1.
Credential-free surface is now **comprehensively covered & GREEN**: render, a11y (critical+serious+moderate = 0 after 2 fixes), security access-control, form validation, keyboard, 404, i18n locale integrity, backend-failure resilience, and **performance on the production build**. Nothing further is testable without authentication.

**Performance (prod build, `npm run qa:perf`):** login LCP 1448ms · privacy 1168ms · signup 1024ms — all well under a 4000ms SPA budget. PASS.

**Deliverable scripts:** `qa:smoke` · `qa:full` · `qa:module` · `qa:report` · `qa:a11y` · `qa:perf`.

**Auth module — comprehensively covered (credential-free):** render (3 viewports), 0 critical a11y, invalid-login rejection + feedback, full keyboard operability, and form validation (empty submit, password mismatch, weak password, login/forgot empty). No new defects beyond BUG-001. UX **91/100**.

---

## Authenticated coverage (Tenant A — company_admin)

Two isolated test tenants created via real signup + onboarding (Stripe checkout blocked → no payment), activated via the code's documented far-future-`trial_ends_at` test bypass. Auth fixtures: `tests/e2e/.auth/tenantA.json`, `tenantB.json`.

**Authed module smoke — 50/50 PASS.** Every authenticated module loads for a company admin with real content, no bounce to login/onboarding/paywall, no uncaught exceptions: Dashboard · CRM (Leads, Deals, Lead Gen, ICP) · Clients · Finance (Invoices, Quotes, Payments) · Tasks · Calendar · Messages · Email (Emails, Bulk, Templates) · Marketing (Meta Ads, Power Dialer, Voice Agent) · AI Media · Personal Assistant · Autopilot · Workspace (Studio, Workflow Chat, Operating Manager, Connected Apps, Documents, Intelligence) · HR (Employees, Attendance, Time Tracking, Work Schedule, Leave, Payroll, Recruitment, Workforce, Reports) · Settings (Company, Profile, Invitations, Webhooks, AI) · Monitoring · Help · Subscription · Onboarding. Platform-admin routes correctly **denied** to a company admin (5/5).

**CRM › Leads CRUD — PASS.** Create a lead through the UI → appears in the list (search) → **persists after a full page refresh**. Real data, isolated to Tenant A.

**Security › cross-tenant isolation — PASS.** A uniquely-marked lead created in Tenant A is **invisible to Tenant B** (backend RLS, proven end-to-end through the UI with both tenants). `tests/e2e/cross-tenant.spec.ts`.

**Still to verify (next):** the Lead→Customer→Deal→Quote→Invoice→Payment flow, CRUD on the remaining modules (deals, tasks, invoices, HR…), filters/search/pagination/empty-states, tablet+mobile for authed flows, and per-module UX scoring.

## Bugs

### BUG-001 — Language selector has no accessible name · **FIXED & VERIFIED**
- **Severity:** critical (a11y, WCAG 2 A `4.1.2` `button-name`)
- **Where:** `src/components/LanguagePicker.tsx` — rendered on all auth pages.
- **Symptom:** axe reported a `role="combobox"` button with no discernible text / aria-label on Login, Signup, Forgot password, Join company.
- **Root cause:** the shadcn `SelectTrigger` had no `aria-label`; screen readers got no name for the control.
- **Fix:** added `aria-label={t('language.label')}` to the trigger. Minimal, no behaviour change.
- **Regression guard:** `tests/e2e/public-smoke.spec.ts` ("has no critical a11y violations") — now green on all 4 auth pages.
- **Verified:** re-ran a11y suite → 7/7 PASS.

---

### BUG-002 — Auth pages missing landmarks + heading structure · **FIXED & VERIFIED**
- **Severity:** moderate (a11y — `landmark-one-main`, `region`, `page-has-heading-one`)
- **Where:** `src/components/auth/AuthLayout.tsx` (shared by login, signup, forgot-password, reset-password, join-company).
- **Symptom:** no `<main>` landmark; logo + language picker sat outside any landmark; login's heading not detected.
- **Fix:** wrapped the header chrome in `<header>` and page content in `<main>`, added `aria-label` to the logo link.
- **Verified:** `scripts/qa/a11y-audit.mjs` (serious+moderate+best-practice) → **0 notable violations** on all three auth pages (was 2 each).

## Blockers

### BLOCKER-001 — Authenticated E2E needs test credentials
- **Impact:** 50 of 57 routes (dashboard, CRM, finance, HR, email, marketing, AI, automation, settings, admin…) cannot be exercised — the app requires Supabase-auth login, and the security mandate requires **≥2 isolated test companies** (cross-tenant isolation).
- **Why it's a true blocker:** no test accounts exist; creating them needs either seeded DB rows or a signup flow (likely email-verified), and cross-tenant tests need two separate tenants with known data.
- **Independent work done meanwhile (not blocked):** full module registry, the Playwright engine, public-route smoke (render + a11y, 3 viewports), anonymous direct-URL access-control for all 50 protected routes, login-form error handling, and keyboard operability.
- **Autonomous unblock attempts — both genuinely closed:**
  - _Local Supabase sandbox_ (the ideal isolated path): **Docker is not installed** on this host, and `supabase start` requires it. 66 migrations + edge functions with external deps also make this non-trivial. → not possible autonomously.
  - _Self-service signup on the current backend_: `VITE_SUPABASE_URL` points at the **production** Supabase project, so creating test companies there would write production data (violates "ingen produktionstestdata") — not done without explicit consent.
- **Needed to unblock (any one):**
  1. Credentials for **2 isolated non-production test companies** (email + password each); or
  2. **Install Docker** so I can run a local Supabase sandbox, apply migrations, seed 2 tenants, and repoint the app to it; or
  3. ~~Consent to create 2 test companies via signup on the current backend~~ — **consent given & attempted, but hit a sub-blocker:** this Supabase project has **"Confirm email" enabled**, so signup returns "Check your email to confirm your account" and grants **no session** (evidence: `tests/e2e/.auth/signup-debug.png`). Automated accounts can't log in without clicking a confirmation email I can't read. A few unconfirmed test users were created (harmless — they cannot authenticate).

### Narrowed unblock (pick one)
- **A (fastest):** give me credentials for **existing, already-confirmed** test accounts (2 companies).
- **B:** briefly **disable "Confirm email"** in Supabase → Authentication → Providers → Email; I then create + confirm 2 tenants automatically, and you re-enable it.
- **C:** **install Docker** → I run a fully isolated local Supabase (confirmation off by default), seed 2 tenants, no production data at all.
- **D:** explicitly authorize me to **confirm the created test users via the Supabase admin/SQL** (a targeted production-auth write) — I can then proceed, but this touches prod auth so I will not do it without that explicit go-ahead.

---

## UX scores (only modules actually exercised — evidence-based)

| Module | Score | Evidence |
|---|---|---|
| **auth** | **91 / 100** | Renders clean on 3 viewports; 0 console errors; 0 critical a11y (after BUG-001 fix); clear error feedback on bad login; full keyboard operability (focus order, visible focus ring, Enter submits); Google + email paths present. Minor: non-critical axe items (serious/moderate) still to review. |
| **legal** (privacy/terms/dpa) | **90 / 100** | Renders clean on 3 viewports; 0 console errors; 0 critical a11y; readable long-form content. Not yet checked: in-page anchor nav / print styling. |

All other modules: **NOT_TESTED** (not PASS) — blocked, see above. No UX score is asserted for a module that has not been exercised.

## Next action
1. Finish the anonymous access-control run (all 50 protected routes redirect to login).
2. Extend public smoke to tablet + mobile viewports.
3. On unblock: build auth fixtures (`storageState` per tenant), then DISCOVER→TEST→AUTOFIX each module (navigation, CRUD, filters, persistence-after-refresh, empty/error states) + the Lead→Customer→Deal→Quote→Invoice→Payment flow, with UX scoring (target ≥90) and cross-tenant isolation checks.
