# Execution Plan — AI Agency Danmark Production Readiness

Living document. Update status as work progresses; do not treat this table as a substitute for the actual implementation/verification.

| ID | Priority | Status | Kilde | Risiko | Acceptkriterier | Testbevis | Commit | Afhængigheder |
|---|---|---|---|---|---|---|---|---|
| E1 | P0 | VERIFIED | `docs/ai/UNCOMMITTED_WORK_PROTECTION.md` (2026-11-08), re-run 2026-11-10 | Data/arbejde | Alt uncommitted arbejde har ekstern backup + checksum-match | 94-fil backup, 0 mismatches, `refs/wip/dialer-calendar-2026-11-10` | n/a (filsystem + git ref) | — |
| E2 | P0 | VERIFIED | Onboarding-serien (8 commits, `9df7844`..`ac08e29`), audited 2026-11-10 | Sikkerhed, betaling | Atomic company bootstrap, RLS-gap lukket, seat-limit enforced server-side, billing-authorization, CSV-import no-data-loss | Isoleret worktree: type-check/lint/build grønt, 357/357 tests passed, 27 skipped (kræver service-role key) | `ac08e29` | — |
| E3 | P0 | PASS (schema/policy) / BLOCKED (behavioral E2E) | `docs/launch/SECURITY_REPORT.md` | Sikkerhed, tenant-isolation | Alle public-tabeller RLS-enabled; HR-tabeller company_id-scoped | Live `list_tables` (130/130 RLS enabled), live `pg_policies`-læsning (6 HR-tabeller) | `50cdae4` | Kræver owner-autoriseret service-role key for fuld 2-tenant E2E |
| E4 | P1 | RESOLVED/RE-VERIFIED | `docs/launch/OWNER_DECISION_RESOLUTION.md` | Proces | 10 åbne beslutninger gennemgået | 7/10 allerede afklaret af senere arbejde; 2/10 har sikre defaults; 1/10 ikke uafhængigt reverificeret | `4edbe4d` | — |
| E5 | P1 | PASS (code) / BLOCKED (live Stripe) | `docs/launch/STRIPE_VERIFICATION.md` | Betaling | Webhook-signatur, idempotency, out-of-order-sikkerhed, seat-limits, trial-overwrite | Kodelæst og bekræftet; 9 unit-tests for trial-overwrite grønne | `0a70757` | Stripe test-mode-nøgler/CLI (ikke tilgængeligt her) |
| E6 | P1 | IMPLEMENTED_NOT_TESTED | `src/test/billing-authorization.integration.test.ts` | Betaling | Non-admin kan ikke ændre abonnement | Testen findes, velkonstrueret, ikke kørt (kræver `SUPABASE_SERVICE_ROLE_KEY` + opretter/sletter rigtige auth-brugere i live projekt) | — | Owner-autorisation til at køre mod live/dedikeret projekt |
| E7 | P2 | REQUIRES_REVIEW | `docs/launch/AI_AGENT_VERIFICATION.md` | Vedligehold | `feature/crm-agents` vs. allerede-shippet CRM-agent-kode | Idempotency- og propose-only-mønster bekræftet allerede live (10 CRM-testfiler grønne) | `bae31a9` | Dedikeret diff-pass før branch-beslutning |
| E8 | P3 | DONE (ingen sletning udført) | `docs/launch/BRANCH_INVENTORY.md` | Lav | Klassificering af 15+ branches | Genverificeret `git branch --merged` + ancestry-checks | `ea0071c` | — |
| E9 | P0 | **NY RISIKO — IKKE LØST** | `docs/launch/BRANCH_INVENTORY.md`, "Open risk" | Sikkerhed, betaling | Aktiv branch og `integration/combined-2026-11-08` løste billing-sikkerhed uafhængigt af hinanden og er ikke forenet | — | — | Dedikeret reconciliation-pass; skal ske før nogen af linjerne merges til `main` |
| E10 | P1 | BLOCKED | `feature/leadgen-chat`, `feature/social-suite`, `feature/marketing-agents`, `feature/finance-ops-agents`, `release/launch-integration` | Varierende | — | Ikke re-verificeret denne session (2026-11-07-fund står uændret) | — | Tid/scope til en dedikeret pass pr. branch |
| E11 | P2 | NOT_STARTED | §12 (design/UX-konsistens), §19.1 (E2E/staging-testmiljøer), §21 (fuld rolle-matrix ud over HR) | — | — | — | — | Separat session — for stort til denne |

## Hvad denne plan IKKE er

Denne plan erstatter ikke implementeringen. Hvert "VERIFIED"/"PASS" ovenfor peger på et konkret dokument/commit med den faktiske evidens — se derfra, ikke kun denne tabel.
