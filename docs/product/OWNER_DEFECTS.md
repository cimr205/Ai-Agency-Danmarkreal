# Owner-Reported Defect Register

_The product owner's observed failures are the acceptance-test starting point. Status: **VERIFIED** (working user-visible outcome + test) / **PARTIAL** / **BLOCKED** (external dep) / **FAILED** / **AUDIT**._

Branch `feature/frontend-operating-system`. Writes use isolated QA tenants; no real payments/emails/ads.

| # | Issue | Severity | Status | Root cause / evidence |
|---|---|---|---|---|
| 2 | CVR lookup | High | **PARTIAL** | Two real bugs: (a) frontend built the function URL from an **undefined** `VITE_SUPABASE_PROJECT_ID` → every call hit `https://undefined.supabase.co` (FIXED → `supabase.functions.invoke`, name search enabled; `cvr-lookup.spec.ts`); (b) the `cvr-search` function mislabels cvrapi.dk's **403 QUOTA_EXCEEDED** as "invalid User-Agent" (FIXED in code). **Live lookup BLOCKED:** cvrapi.dk free tier is quota-exhausted on the Supabase edge IP (proved: the exact UA returns **200 + real Novo Nordisk data** from a non-quota IP). Needs a **paid cvrapi.dk token** (owner) + edge-function deploy. |
| 1 | Control Center / right sidebar | High | **BLOCKED** | The panel's **approve/reject/execute** path is model-free and **works** (`ai-assist-pipeline.spec.ts` proves propose→approve→execute→audit on the same `ai-operating-manager`). The **natural-language command** path (the primary way to create ops) needs the **AI model** → BLOCKER-AI-001 (provider 404). Errors are surfaced (the `invoke` helper extracts the server message). Needs an available model. |
| 8 | Workforce Dashboard first in nav | Low | **PARTIAL** | Reordered in `AppSidebar.tsx` (Workforce now first in the manager HR group). The **active** nav `WorkspaceRail.tsx` has the workforce item **last** but is in the *other agent's uncommitted* changes → BLOCKED on coordination (1-line move: put the `hr/workforce` item at the top of the HR group). |
| 6 | Paid user seats / invitations | High | **BLOCKED (needs approval)** | Stripe infra exists (`create-checkout`, `stripe-webhook`, `check-subscription`) and the **seat model already exists** (`subscriptions.active_user_count/price_per_user`, `companies.purchased_seats/seat_limit_trial`). **Gap:** `create_invitation` does **not** check seat availability → unlimited billable invites. Authoritative fix = a seat check inside `create_invitation` (backend → deploy-blocked) + a purchase flow. **Owner decisions required:** seat price/proration, trials, are admins billable, refund/abandoned-checkout rules. Not changing live billing without approval. |
| 7 | Recruitment workflow | Medium | **PARTIAL** | Openings are usable: the create form now captures the rich fields the backend already supports (department, salary, description, requirements — previously only `position`), and the status lifecycle open→interviewing→filled/closed persists (`recruitment.spec.ts`). The full applicant journey (candidate profiles, screening, interviews, decisions) has **no backend table** (only `recruitment` openings + an `applicants_count`) → needs new migrations (deploy-blocked) + a product-scope decision. |
| 5 | AI Media image generation | Medium | **BLOCKED** | `ai-generate` uses OpenRouter `meta/muse-image`; the key is configured but the account returns **402 "Credits opbrugt" (credits exhausted)**. Not a code bug — needs the owner to fund/replace the OpenRouter key. The UI already shows an honest error toast (does not fake success). |
| 3 | Calendar redesign | Low | **DEFERRED** | Calendar is functionally VERIFIED (`calendar.spec.ts`: event CRUD + task-on-calendar + responsive). The request is purely visual polish (day/week/month views look); deprioritized under the directive's "fix broken core first" ordering. No functional defect. |
| 4 | Lead Generation visual consistency | Low | **DEFERRED** | Visual/design-consistency only; no functional defect reported. Deprioritized under the directive's ordering; a proper design-system refactor is a separate focused task. |

## Blocked external dependencies
- **cvrapi.dk paid token** (Issue 2 live) — free tier quota-limited on shared edge IP.
- **Edge-function deploy access** — I cannot deploy Supabase functions; backend code fixes (cvr-search error mapping) are written but need the owner to deploy.
- **Stripe test keys + pricing rules** (Issue 6).
- **AI model provider** (Issues 1 cmd / 5) — BLOCKER-AI-001.
- **Service-role key / confirmed accounts** (multi-user, onboarding).
