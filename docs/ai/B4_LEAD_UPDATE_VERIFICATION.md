# B4 — Lead update verification

Date: 2026-10-21. Workspace: `/Users/macbookpro/mastra-worktree`. Branch: `chore/mastra-install`.

## Outcome

`crm.lead.update` is implemented in the Action Registry and Mastra proposal bridge, and verified against the existing dedicated Supabase test project `upqzzkdqlaqzgprufzrf`. Production identifiers were supplied to the existing guard and confirmed distinct before deployment. Only `ai-operating-manager` and its imported shared modules were deployed to this test project. No production deployment, push, merge or commit was performed.

The action updates only last_touched_at, next_followup_at, notes, phone and status. It requires an authenticated member role, explicit approval and a tenant-owned `customers` record with `record_type='lead'`. Unknown fields and invalid/empty changes are rejected. Changed-field snapshots are returned and recorded in the completed action audit; optimistic comparisons detect intervening changes to those fields. See `CRM_LEAD_UPDATE_ACTION_SPEC.md` for null handling and recovery limitations.

## Verification

| Check | Observed result |
|---|---|
| Targeted Vitest: lead-update validator and proposal bridge | 21 passed |
| New live API E2E, spec 08 | 5 passed |
| Existing live API E2E, specs 01–06 | 12 passed |
| Full Vitest, `npx vitest run --maxWorkers=1` | 224 passed, 2 skipped; 43 passed files, 1 skipped |
| `npm run build` | PASS, 39.55 seconds |
| ESLint: changed client, unit-test and E2E files | PASS; edge-function directory is excluded by existing lint configuration |
| `npm run type-check` | FAIL: five errors in untouched files, listed below |
| Existing localhost:8080 | HTTP 200 before and after; not restarted |
| Cleanup | Two marked test companies and four test auth users removed, along with test records; follow-up query returned zero marked companies |

The initial concurrent full Vitest run hit the existing five-second timeout in `ColdCallerPage.test.tsx`; its isolated rerun passed all seven tests, and the subsequent single-worker full suite passed. The first new E2E attempt assumed Company B had an owner; the fixture provides a manager. Correcting the test to use that manager produced the five passing tests.

The new E2E covers approval-before-write, persisted timestamps/nulls/notes, completed before/after audit, duplicate proposal keys, duplicate approval without overwriting a later update, cross-tenant approval denial, foreign/missing/non-lead targets, input allowlisting, rejection without mutation, and readonly proposal/approval denial. It uses real authenticated API calls, not a browser/UI journey.

## Remaining limitations

- Typecheck reports TS2352 in `src/mastra/e2e/supabase-port.ts:55` and `:60` (dynamic-select result casts), TS2339 in `src/pages/app/admin/AdminEmployees.tsx:100`, and TS2352 in `src/pages/app/admin/AdminUsers.tsx:101` and `src/pages/app/settings/InvitationsPage.tsx:46` (invitations.token versus token_hash). These files were not changed for B4. Earlier reports of a clean typecheck do not describe this current checkout.
- Reply-sync and follow-up consumers still use their existing review-task behavior. Their separate `leads` IDs must be reconciled with canonical `customers` lead IDs before wiring update proposals. This verification closes the registry action gap, not every CRM workflow.
- Automatic rollback, transactional mutation-plus-audit, concurrent conflict execution tests, deeper approval UI flows and production deployment are not claimed verified.
- B1 production model configuration, B5 marketing persistence, B6 HR actual-hours support and B2 production-schema fidelity remain open.

## Re-run

After provisioning test tenants with the existing guarded harness:

```sh
bash scripts/e2e/with-env.sh npx playwright test -c e2e/playwright.config.ts e2e/tests/08-crm-lead-update.spec.ts --workers=1
bash scripts/e2e/with-env.sh npx playwright test -c e2e/playwright.config.ts '0[1-6]-' --workers=1
npx vitest run --maxWorkers=1
npm run type-check
npm run build
bash scripts/e2e/with-env.sh node scripts/e2e/cleanup.mts
```
