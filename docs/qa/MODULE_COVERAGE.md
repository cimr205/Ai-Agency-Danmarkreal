# AI Agency Danmark — Module Coverage

_Source of truth: actual routes in `src/App.tsx` (83 `<Route>` elements) cross-checked against `tests/e2e/registry.ts`._
_Last updated: 2026-10-17 · Branch: `feature/frontend-operating-system`_

**Honesty rule:** a module is **VERIFIED** only when its real implementation was exercised with evidence. A route that could not be run (auth-blocked) is **NOT_TESTED**, never PASS.

Legend: ✅ PASS (evidence) · ⛔ BLOCKED (needs login) · ◻️ NOT_TESTED · 🔒 role-gated

---

## Summary

| Surface | Routes | Status |
|---|---:|---|
| Public (auth pages, legal) | 7 | ✅ **PASS** — render + critical-a11y on 3 viewports; access-control; form validation; keyboard; i18n; resilience |
| Protected `/app/*` + `/admin/*` | ~55 | ⛔ **BLOCKED** on login session (QA-BLOCK-001) |
| Anonymous access-control over protected routes | 50 | ✅ **PASS** — all redirect to `/auth/login`, no data leakage |

**Verified without credentials:** rendering, critical accessibility, security/access-control, form validation, keyboard operability, 404 handling, i18n locale integrity, and backend-failure resilience. Nothing further is reachable without authentication.

---

## Public modules — ✅ tested

| Module | Route(s) | Status | Evidence |
|---|---|---|---|
| auth | `auth/login`, `auth/signup`, `auth/forgot-password`, `auth/join-company`, `auth/register-company`, `auth/reset-password`, `auth/join` | ✅ PASS | render+a11y (desktop/tablet/mobile), invalid-login feedback, 5 form-validation cases, full keyboard nav. BUG-001/002 (a11y) fixed & verified in prior run. |
| legal | `privacy`, `terms`, `dpa` | ✅ PASS | render+a11y on 3 viewports, 0 console errors |
| security | all 50 protected routes accessed anonymously | ✅ PASS | every route redirects to login; no leakage |

## Protected modules — ⛔ BLOCKED (login required)

Exhaustive list of what remains to be exercised once a session exists. Each is **NOT_TESTED**, not failing — simply unreachable.

| Module | Routes | Role | Status |
|---|---|---|---|
| dashboard | `app/dashboard` | auth | ⛔ |
| crm | `app/crm/leads`, `app/crm/deals`, `app/crm/pipeline`, `app/crm/lead-generation`, `app/crm/icp` | auth | ⛔ |
| clients | `app/clients`, `app/clients/:id` | auth | ⛔ |
| finance | `app/finance/invoices`, `app/finance/quotes`, `app/finance/payments` | auth | ⛔ |
| work | `app/work/tasks`, `app/work/calendar`, `app/work/inbox` | auth | ⛔ |
| email | `app/email/emails`, `app/email/bulk`, `app/email/templates`, `app/email/inbox`, `app/email/todos` | auth | ⛔ (⚠️ QA-001 XSS fix applied here, awaiting browser verification) |
| marketing | `app/marketing/meta-ads`, `app/marketing/cold-caller`, `app/marketing/voice-agent` | auth | ⛔ |
| ai | `app/ai/media`, `app/pa`, `clowdbot` | auth | ⛔ |
| automation | `app/autopilot` | auth | ⛔ |
| workspace | `studio`, `workflow-chat`, `operating-manager`, `connected-apps`, `documents`, `intelligence` | auth | ⛔ |
| hr | `employees`🔒, `attendance`, `time-tracking`, `work-schedule`, `leave`, `payroll`🔒, `recruitment`🔒, `workforce`🔒, `reports`🔒 | mixed | ⛔ |
| settings | `company`, `profile`, `invitations`🔒, `webhooks`🔒, `ai`🔒 | mixed | ⛔ |
| system | `monitoring`🔒, `help`, `subscription`, `phone-companion` | mixed | ⛔ |
| onboarding | `app/onboarding` | auth | ⛔ |
| admin | `overview`, `companies`, `users`, `contacts`, `settings`, `data-deletion-requests` | system_admin 🔒 | ⛔ |

## Cross-module business flows — ⛔ BLOCKED
Lead→qualification→deal→customer→quote→invoice→payment · Customer→task→employee→calendar→invoice · Campaign→lead→CRM→follow-up · Employee→schedule→attendance→leave→payroll · AI request→approval→execution→DB result. All require authentication; none testable yet.

---

## Registry drift (QA-002)
Routes present in `App.tsx` but missing from `tests/e2e/registry.ts`: `crm/pipeline`, `clients/:id`, `clowdbot`, `phone-companion`, `email/inbox`, `email/todos`, `admin/{companies,contacts,users,overview,data-deletion-requests}`, `settings` index, `auth/{register-company,join,reset-password}`. Update the registry so the coverage count reflects the true ~62-route surface.
