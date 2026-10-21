# Mastra Two-Tenant E2E (QA-1)

Authenticated end-to-end tests against a **dedicated, non-production** Supabase test project. Nothing here ever touches production — every entry point refuses unless a test project is configured and explicitly acknowledged.

## What the owner must provide (the only remaining blocker)

Create a **separate Supabase project** for testing (not production) and export:

| Env var | What |
|---|---|
| `TEST_SUPABASE_URL` | the test project URL (must differ from `VITE_SUPABASE_URL`) |
| `TEST_SUPABASE_ANON_KEY` | test project anon/publishable key |
| `TEST_SUPABASE_SERVICE_ROLE_KEY` | test project service-role key (provision/cleanup only) |
| `TEST_SUPABASE_DB_URL` | test project Postgres URL (for migrations) |
| `E2E_ALLOW_TEST_PROJECT=1` | explicit acknowledgement it is non-production |

Optional: `TEST_SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` (for `supabase db push` instead of psql); `E2E_APP_BASE_URL` (defaults to `http://localhost:8080`); `E2E_MODE_A` / `E2E_MODE_B`.

> Recommended on the test project: disable email confirmation (users are created pre-confirmed via the admin API anyway). Use ONLY the test keys — never production keys/URLs/service-role.

## Run order

```bash
# 1) apply schema to the test project
TEST_SUPABASE_DB_URL=... E2E_ALLOW_TEST_PROJECT=1 bash scripts/e2e/apply-migrations.sh

# 2) provision two tenants (A + B) with distinct roles/users/records
#    writes e2e/.tenants.local.json (gitignored)
TEST_SUPABASE_URL=... TEST_SUPABASE_ANON_KEY=... TEST_SUPABASE_SERVICE_ROLE_KEY=... \
E2E_ALLOW_TEST_PROJECT=1 node scripts/e2e/setup-tenants.mts

# 3) install the browser (one-time; ~heavy — do on a capable machine)
npm i -D @playwright/test && npx playwright install chromium

# 4) run the authenticated suite
TEST_SUPABASE_URL=... TEST_SUPABASE_ANON_KEY=... TEST_SUPABASE_SERVICE_ROLE_KEY=... \
E2E_ALLOW_TEST_PROJECT=1 npx playwright test -c e2e/playwright.config.ts

# 5) remove ONLY e2e-marked data
TEST_SUPABASE_URL=... TEST_SUPABASE_SERVICE_ROLE_KEY=... TEST_SUPABASE_ANON_KEY=... \
E2E_ALLOW_TEST_PROJECT=1 node scripts/e2e/cleanup.mts
```

## Coverage

| Spec | Verifies |
|---|---|
| `01-proposal-approval-execution` | agent proposal → approval → execution → DB persistence + audit |
| `02-tenant-isolation` | Company B cannot approve A's action (404) nor read A's rows (RLS) |
| `03-authorization` | employee cannot approve a manager-only action (403) |
| `04-automation-modes` | DRAFT_APPROVAL awaits approval; OFF/AUTO never bypass mandatory high-risk approval |
| `05-duplicate-retry` | same idempotency key → no duplicate; re-approve → `idempotentReplay` |
| `06-department-workflows` | CRM/Marketing/Finance/HR propose→approve→persist (drafts only; no sends/payments) |
| `07-ui-smoke` | authenticated UI login renders the app shell (adjust selectors to the build) |

## Machine- & project-specific requirements (discovered 2026-10-20)

- **macOS 13 (this Mac):** Playwright's bundled Chromium won't install ("does not support chromium on mac13"). Specs 01–06 are `fetch`-only and run under the Playwright runner with **no browser**. The UI spec (07) uses the **system Google Chrome** via `channel: "chrome"` (already configured + `npx playwright install chrome` done). On newer macOS you can use bundled Chromium instead.
- **Edge Functions must be deployed to the test project.** Specs 01–06 call `/functions/v1/ai-operating-manager`. A fresh Supabase project has none, so after migrations you must deploy it (and `_shared`) to the test ref:
  ```bash
  SUPABASE_ACCESS_TOKEN=... supabase functions deploy ai-operating-manager --project-ref <TEST_REF>
  ```
  The function reads `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (auto-injected for deployed functions). The actions these specs use (`tasks.create`, `crm.lead.create`, `invoice.create` draft, `marketing.campaign.create`, `hr.employee.create`) are internal DB writes — no AI-gateway secret required. Until deployed, specs 01–06 return 404.
- **New Supabase keys:** publishable (`sb_publishable_…`) → `TEST_SUPABASE_ANON_KEY`; secret (`sb_secret_…`) → `TEST_SUPABASE_SERVICE_ROLE_KEY`. Legacy JWT keys also work. `@supabase/supabase-js@2.91` and the REST/Auth/Functions `apikey` header accept both.

## Safety

- `src/mastra/e2e/testenv.ts` guards refuse production URLs / project ids and require `E2E_ALLOW_TEST_PROJECT=1`.
- `cleanupTestData` deletes ONLY resources with the `[e2e-qa]` company-name marker and the `@e2e.aiagencydk.test` email domain.
- No deploy, no push, no production access, no real emails/payments.
