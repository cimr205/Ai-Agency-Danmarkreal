# AI Agency Danmark — Localhost QA Task Board

_Persistent, resumable task board. Statuses: DISCOVERED → READY → IN_PROGRESS → TESTING → VERIFIED | BLOCKED._
_Priority: P0 security/data-integrity · P1 broken workflow · P2 usability · P3 polish._

**Repo:** `cimr205/Ai-Agency-Danmarkreal` · **Branch:** `feature/frontend-operating-system` · **Localhost:** http://localhost:8080 (Vite, verified 200)
**Last updated:** 2026-10-17

> Coexistence note: another agent is active in this working tree (uncommitted changes to `Dashboard.tsx`, workspace shell, contexts, i18n, `package.json`/`package-lock.json`, …). This board only touches files **outside** that set, adds **new** files under `docs/qa/` + `tests/`, and never stashes/resets/commits another agent's work.

---

## Engine / ground truth (this session, 2026-10-17)

| Check | Command | Result |
|---|---|---|
| TypeScript | `npm run type-check` | ✅ exit 0 (full tree, incl. other agent's uncommitted changes) |
| Dev server | `curl localhost:8080` | ✅ 200 |
| Supabase email confirmation | signup probe via `/auth/v1/signup` | ⚠️ **ON** — synthetic signups get no session (auth testing blocked) |
| Credential-free Playwright | smoke + access-control + forms + keyboard + i18n (desktop) | ✅ **75/75 passed** on current tree (14 + 61) |
| Production build | `npm run build` | ✅ exit 0 (3m22s) |

---

## Tasks

### QA-001 — Stored XSS in email viewer (`body_html` rendered raw) · **P0 · TESTING**
- **Module:** email (`src/pages/app/email/EmailsPage.tsx:538`)
- **Issue:** Gmail-synced `selectedEmail.body_html` was injected with `dangerouslySetInnerHTML` and **no sanitization anywhere** in the project (no `DOMPurify`/`sanitize-html` dependency; no server-side sanitize in `supabase/functions/gmail-sync`).
- **Impact:** Email bodies are attacker-controlled. A crafted email (`<img src=x onerror=…>`, injected event handlers) executes JS in the app origin → can read the Supabase session from `localStorage` → **account/tenant takeover**. Classic stored XSS.
- **Severity:** P0 (security).
- **Repro (static):** `grep -n dangerouslySetInnerHTML src/pages/app/email/EmailsPage.tsx` → line 543; `grep -rn DOMPurify\|sanitize src` → none.
- **Fix (applied):** Replaced the raw-injection `<div>` with a **sandboxed `<iframe sandbox="" referrerPolicy="no-referrer" srcDoc={body_html}>`**. An empty `sandbox` value withholds `allow-scripts`, so scripts and inline handlers cannot run, while HTML/images still render. Dependency-free (does not touch the other agent's `package.json`/lockfile).
- **Verification:** ✅ `npm run type-check` clean after edit. ⛔ Authenticated **browser** verification BLOCKED (login blocker QA-BLOCK-001) — the email module is behind auth. Visual/behavioural confirmation pending credentials.
- **Status:** TESTING (fix in tree, compiles; awaiting authenticated browser verification).

### QA-002 — Route registry drift vs `App.tsx` · **P3 · DISCOVERED**
- **Module:** qa-infra (`tests/e2e/registry.ts`)
- **Issue:** `App.tsx` exposes routes not in the registry: `crm/pipeline`, `clients/:id`, `clowdbot`, `phone-companion`, `email/inbox`, `email/todos`, admin children (`companies`, `contacts`, `users`, `overview`, `data-deletion-requests`), `settings` index, and auth extras (`register-company`, `join`, `reset-password`). Coverage math under-counts real surface.
- **Severity:** P3 (test-accuracy, not a product bug).
- **Fix (proposed):** Add the missing routes to `registry.ts` so MODULE_COVERAGE stays in sync. (Not yet applied — low priority; documented in MODULE_COVERAGE.md.)
- **Status:** DISCOVERED.

---

## Blockers

### QA-BLOCK-001 — Authenticated testing needs a real login session · **BLOCKS ~50 app routes**
- **Why:** This branch authenticates via **Supabase Auth directly** (`supabase.auth.signInWithPassword` / `signUp`, `AuthContext.tsx`). The data layer also hits Supabase directly under RLS. Every `/app/*` and `/admin/*` route requires an authenticated session.
- **Confirmed this session:** `POST /auth/v1/signup` returns **no `access_token`** and sets `confirmation_sent_at` → **"Confirm email" is ON**. Synthetic signups cannot authenticate. `VITE_SUPABASE_URL` points at the **production** project (`vbxlpxhvojlaisxcipyh`), so seeding/confirming there is a production write — not done without explicit consent.
- **claude-in-chrome note:** the in-browser automation extension can reach public sites but **cannot reach this machine's `localhost:8080`** (network isolation). Local **Playwright** (real Chrome, `channel:"chrome"`) *can* reach localhost and remains the real-browser runner — it just still needs a session.
- **Unblock — pick one (then I proceed autonomously):**
  - **A (fastest):** credentials for **2 existing, already-confirmed** non-production test companies (email + password each) → enables cross-tenant isolation tests.
  - **B:** briefly **disable "Confirm email"** in Supabase → Auth → Providers → Email; I create + confirm 2 tenants, you re-enable.
  - **C:** **install Docker** → I run a fully isolated local Supabase, seed 2 tenants, repoint the app — zero production data.
  - **D:** explicitly authorize a **service-role** admin-confirm of test users (production-auth write) — I will not do this without that go-ahead.

---

## Done-condition tracker
- [x] Repo / branch / localhost verified
- [x] Module & route inventory
- [x] Ground-truth typecheck on current tree
- [x] Credential-free surface re-verified (see FINAL_REPORT)
- [x] First P0 found + fixed in tree (QA-001)
- [ ] Authenticated modules tested — **BLOCKED** (QA-BLOCK-001)
- [ ] Cross-module business flows — **BLOCKED**
- [ ] Deliverables: LOCALHOST_TASKS.md ✅ · MODULE_COVERAGE.md ✅ · UX_AUDIT.md ✅ · FINAL_REPORT.md ✅
