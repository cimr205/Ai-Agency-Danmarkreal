# Owner-Reported Defect Register

_The product owner's observed failures are the acceptance-test starting point. Status: **VERIFIED** (working user-visible outcome + test) / **PARTIAL** / **BLOCKED** (external dep) / **FAILED** / **AUDIT**._

Branch `feature/frontend-operating-system`. Writes use isolated QA tenants; no real payments/emails/ads.

| # | Issue | Severity | Status | Root cause / evidence |
|---|---|---|---|---|
| 2 | CVR lookup | High | **PARTIAL** | Two real bugs: (a) frontend built the function URL from an **undefined** `VITE_SUPABASE_PROJECT_ID` → every call hit `https://undefined.supabase.co` (FIXED → `supabase.functions.invoke`, name search enabled; `cvr-lookup.spec.ts`); (b) the `cvr-search` function mislabels cvrapi.dk's **403 QUOTA_EXCEEDED** as "invalid User-Agent" (FIXED in code). **Live lookup BLOCKED:** cvrapi.dk free tier is quota-exhausted on the Supabase edge IP (proved: the exact UA returns **200 + real Novo Nordisk data** from a non-quota IP). Needs a **paid cvrapi.dk token** (owner) + edge-function deploy. |
| 1 | Control Center / right sidebar | High | AUDIT | Pending — likely the Operating Manager command path (needs the AI model, BLOCKER-AI-001) vs. unwired approve buttons. |
| 8 | Workforce Dashboard first in nav | Low | AUDIT | Pending nav config change. |
| 6 | Paid user seats / invitations | High | AUDIT | Needs Stripe test keys + owner pricing decisions (proration/trials/non-billable admins). Likely BLOCKED for live billing. |
| 7 | Recruitment workflow | Medium | AUDIT | Pending. |
| 5 | AI Media image generation | Medium | AUDIT | Likely BLOCKED (provider/model, cf. BLOCKER-AI-001). |
| 3 | Calendar redesign | Low | AUDIT | Calendar is functionally VERIFIED (`calendar.spec.ts`); request is visual. |
| 4 | Lead Generation visual consistency | Low | AUDIT | Visual/design. |

## Blocked external dependencies
- **cvrapi.dk paid token** (Issue 2 live) — free tier quota-limited on shared edge IP.
- **Edge-function deploy access** — I cannot deploy Supabase functions; backend code fixes (cvr-search error mapping) are written but need the owner to deploy.
- **Stripe test keys + pricing rules** (Issue 6).
- **AI model provider** (Issues 1 cmd / 5) — BLOCKER-AI-001.
- **Service-role key / confirmed accounts** (multi-user, onboarding).
