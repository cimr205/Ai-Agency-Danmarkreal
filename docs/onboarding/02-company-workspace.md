# Onboarding 2/7 — Company creation and workspace

## What already worked
- Tenant isolation via `get_user_company_id()`-scoped RLS on the core tables — verified the existing `companies`/`profiles`/`user_roles` SELECT/UPDATE policies all key off it correctly.
- The CVR lookup backend (`cvr-search` edge function, calling cvrapi.dk) was already solid: caching, rate limiting, clear per-case errors (quota exhausted vs. invalid user-agent vs. timeout vs. no results), and a reusable `CvrLookupField` frontend component.

## What was fixed
- **CVR lookup was unusable during onboarding.** `cvr-search` required `profile.company_id` to already exist and 403'd otherwise — but CVR lookup is needed *while creating the company*, before any `company_id` exists. Changed it to rate-limit per authenticated user instead (the data is public Danish company-registry data; there was nothing tenant-sensitive the company_id check was actually protecting).
- **Company creation wasn't atomic.** The wizard did three separate network calls — insert `companies`, then `bootstrap_company_profile` RPC, then `bootstrap_company_admin` RPC. A failure between any two left an orphaned, ownerless company row with no clean retry path. Replaced with one `SECURITY DEFINER` function, `bootstrap_company()`, doing all three in a single transaction — a mid-flight failure now rolls back completely.
- **Missing fields**: wizard now collects CVR (optional, DK-only, via `CvrLookupField`), country (select, defaults `DK`), timezone (select, auto-detected via `Intl.DateTimeFormat`, defaults `Europe/Copenhagen`), company size (optional), and industry (optional) — all per the spec's field list. CVR is not required for non-DK countries.
- **RLS insert gap found and closed**: the existing `companies` INSERT policy only checked `auth.uid() IS NOT NULL` — any authenticated user could insert unlimited, unowned company rows directly from the client, bypassing the RPC's own "one workspace per user" check entirely. New policy additionally requires the caller not already have a `company_id` on their profile. `bootstrap_company()` is unaffected (SECURITY DEFINER functions aren't subject to the caller's RLS).

## Schema / migration (written, NOT applied)
`supabase/migrations/20261108144043_atomic_company_bootstrap.sql`:
- Adds `companies.country` and `companies.timezone` (didn't exist before).
- Adds `bootstrap_company(...)` RPC (atomic creation + profile link + admin role).
- Tightens the `companies` INSERT policy as described above.
- Leaves `bootstrap_company_profile`/`bootstrap_company_admin` in place (commented as superseded), in case anything else calls them — dropping them is a separate, reviewable decision.

**This migration has not been applied to the live project** — per "no production migrations without approval." Until it is applied and `supabase/integrations/supabase/types.ts` is regenerated, `OnboardingWizard.tsx` calls the RPC through a narrow, clearly-commented type cast (the function doesn't exist in the generated types yet); the cast should be removed once the migration lands.

## Tests
- `src/test/migrations-lint.test.ts` / `reconstructed-schema.test.ts`: pass unchanged (new migration file conforms to the existing naming/format conventions).
- `src/test/company-bootstrap.integration.test.ts` (new, same skip-if-no-service-key pattern as the other integration suites): company creation, CVR-optional, duplicate-request rejection (no second workspace, no orphaned row), direct-insert-bypass rejection, and cross-tenant isolation (company A can't read or update company B). **Not run this session** — requires both `SUPABASE_SERVICE_ROLE_KEY` and the pending migration to be applied; self-skips (5/5 skipped) exactly like the pre-existing integration suites until then.
- Full suite: 358 passed, 22 skipped (4 service-role-gated integration files), 0 failed. `type-check` and `build` both clean.
- Manual browser verification not completed this session (Chrome extension connection unavailable) — structural correctness verified via the automated checks above only.

## Not deployed
Code changes are committed to the working branch only. The migration is written but not applied; `cvr-search`'s code fix is committed but not deployed to the live edge function. No production changes made.
