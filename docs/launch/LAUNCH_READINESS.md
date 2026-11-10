# Launch Readiness Report — 2026-11-10

## EXECUTIVE SUMMARY

This pass picked up from a 2026-11-08 git-integration session and found that substantial, independent security/billing work had already landed on the active branch in the meantime (8 commits, "Onboarding 1/7..7/7") — closing exactly the gaps this mission's masterprompt asked for (RLS gap in company creation, billing authorization holes, seat-limit enforcement, trial-overwrite). That work was **re-verified from scratch** (not trusted from its own commit messages): type-check, lint, build, and the full test suite (357 passed, 0 failed) all re-run independently in an isolated worktree.

Beyond re-verification, this session added **live, read-only verification against the actual Supabase project** (via the Supabase MCP tools) that was not possible in the prior pass: confirmed all ~130 public tables have RLS enabled, and read the actual RLS policy definitions for all 6 core HR tables, confirming consistent tenant-scoping. This is real evidence, not inference from code review alone — though it stops short of a full two-tenant behavioral test, which this session correctly declined to fabricate against a live project holding real customer data without explicit authorization.

**What works, verified:** tenant isolation at the RLS/policy layer (schema-wide + HR-specific), the trial-overwrite fix, Stripe webhook signature verification + idempotency + out-of-order handling, seat-limit enforcement, atomic company bootstrap, CRM-agent idempotency (already shipped, re-confirmed).

**What's still blocked:** true behavioral cross-tenant E2E testing, the full Stripe test-mode matrix, and — the most important new finding of this session — **two independently-evolved lines of billing-security work (the active branch's onboarding series, and this session's/the prior session's `integration/combined-2026-11-08` branch) have not been reconciled.** Merging both as-is risks two different trial/billing logic paths colliding.

**Is the platform safe for the planned first launch?** The core security/billing fundamentals are in good shape and well-tested at the code level. It is **not** yet safe to merge-and-deploy blind, because of the unreconciled branch divergence above and the absence of any live behavioral test run. See LAUNCH VERDICT.

## IMPLEMENTATION RESULTS

| Work | Commit(s) |
|---|---|
| Fresh backup of uncommitted work (94 files, 0 checksum mismatches) + git-native snapshot ref | `refs/wip/dialer-calendar-2026-11-10` |
| Re-verified the 8-commit onboarding/billing-security series | (re-test only, no code changes; commits `9df7844`..`ac08e29` pre-existing) |
| Merged `fix/trial-3-days` + `fix/employee-id-collision` into `integration/combined-2026-11-08`, resolving 2 real conflicts | `123cc4e`, merge commit for employee-id-collision on that branch |
| Live RLS/advisor security review | `50cdae4` (`docs/launch/SECURITY_REPORT.md`) |
| Owner-decision resolution (10 items) | `4edbe4d` |
| Stripe/billing code-level verification | `0a70757` |
| CRM-agent/idempotency verification | `bae31a9` |
| Branch inventory re-verification | `ea0071c` |
| Execution plan | `74ce423` |

No application code was modified in this pass — every change was either a merge-conflict resolution (on the separate `integration/combined-2026-11-08` branch, not the active one) or new documentation.

## SECURITY STATUS

- **Tenant isolation (DB/RLS):** PASS, schema-wide (130/130 tables RLS-enabled) and HR-specific (6/6 tables correctly `company_id`-scoped, verified by reading live policy text). BLOCKED on a live two-tenant behavioral test.
- **Role-based access:** HR verified at the RLS layer; billing authorization verified at the code layer (`check-subscription`/`create-checkout`/`customer-portal` now have server-side role checks per the onboarding series); a full cross-module permission matrix (CRM/finance/marketing/admin) was not re-derived this pass.
- **AI actions:** CRM agents confirmed propose-only + idempotent (re-verified, not newly built).
- **Database access:** a real, live hardening finding — 81 `SECURITY DEFINER` functions callable by `anon`, 95 by `authenticated`, via PostgREST RPC — flagged but **not remediated** (176 functions is too large a blast radius to mass-fix in one pass without checking each call site; every spot-checked function fails safely on an unauthorized caller via its own internal checks, so this is a defense-in-depth gap, not a confirmed active breach).
- **Secrets:** no secrets were read, logged, or committed in this session. The `.env.local` public anon key was reused across isolated worktrees in the prior session; no service-role key was ever requested or used.

## TEST RESULTS

| Gate | Result | Where |
|---|---|---|
| `npm run type-check` | PASS | Isolated worktree at `ac08e29` |
| `npm run lint` | PASS (0 errors, 43 pre-existing warnings) | Same |
| `npm run build` | PASS | Same |
| `npx vitest run` | **357 passed, 0 failed, 27 skipped** (skips require `SUPABASE_SERVICE_ROLE_KEY`) | Same |
| Combined integration branch (`integration/combined-2026-11-08`, after merging the 2 new fix branches) | 397 passed, 0 failed, 7 skipped | `/Users/macbookpro/integration-combined-2026-11-08` |
| Live Stripe test-mode matrix (§14.3, 15 items) | **Not run** — no test keys/CLI in this environment | — |
| Live two-tenant cross-read test | **Not run** — correctly declined without owner authorization against a live project with real data | — |

## BRANCH STATUS

See `docs/launch/BRANCH_INVENTORY.md` for the full table. Summary: 10 branches confirmed merged (safe to delete, not yet deleted), 4 `worktree-agent-*` refs confirmed as already-folded-in checkpoints, 1 branch (`feat/ai-free-model-fallback`) confirmed obsolete, 1 branch (`feature/crm-agents`) flagged as likely-superseded-but-undiffed, 1 new critical finding (active branch vs. `integration/combined-2026-11-08` divergence on billing security).

## REMAINING BLOCKERS

1. **Active branch vs. integration/combined-2026-11-08 reconciliation** (new finding this pass). What's missing: a diff of both lines' billing/trial logic, a decision on which is canonical, retirement of the other. Why it can't be closed now: requires careful line-by-line comparison across ~15 files, out of this session's remaining budget. Consequence if unaddressed: merging both independently could reintroduce the trial-overwrite bug or create two conflicting webhook-idempotency schemes. **Smallest next step:** diff `create-checkout`, `check-subscription`, `stripe-subscription-webhook`/`stripe-payment-webhook`, and `accept_invitation` between the two lines.
2. **Live behavioral tenant-isolation and billing-authorization tests** (§7.1, §14.3). What's missing: either a dedicated non-production Supabase project, or owner-authorized service-role access to run the existing, well-constructed integration tests safely. Consequence: current confidence is schema/code-level, not behavioral. **Smallest next step:** owner provisions a throwaway Supabase project (free tier) with the same migrations applied, or authorizes running the existing tests against a branch/clone of the current project.
3. **176 over-permissioned SECURITY DEFINER functions.** What's missing: a per-function review of actual call sites to safely tighten `anon`/`authenticated` EXECUTE grants. Consequence: defense-in-depth gap, not a confirmed breach. **Smallest next step:** a dedicated pass grepping the frontend for every `.rpc('fn_name', ...)` call to build an allowlist, then revoke the rest.
4. **Full Stripe test-mode matrix, onboarding E2E, design/UX consistency pass, finance/marketing/social-suite agent re-verification** — all explicitly out of scope for this session's time budget; none were falsely marked done.

## LAUNCH VERDICT

**CONDITIONAL GO** — for a narrowly-scoped first release only, and only after closing blocker #1 above.

Scope this applies to: core CRM + HR + billing/onboarding on the **active branch's** line of work (`feature/dialer-calendar-design-and-errors`), with Marketing/Social Suite/advanced AI agent modules kept behind a flag or simply not routed to in the first release (per the masterprompt's own §26: "En ikke-færdig Social Suite... skal ikke automatisk forhindre lancering af en sikker, afgrænset CRM-platform").

This is **not** an unconditional GO because:
- Blocker #1 (unreconciled billing-security lines) is a real risk to the exact thing this mission prioritized highest (payment correctness) and must be closed first — it is a small, well-scoped fix, not a structural problem.
- No live behavioral test has ever confirmed tenant isolation or billing authorization actually work end-to-end against a running system — everything verified this pass is schema-level, policy-level, or unit/integration-level with mocks or skipped live suites.

It is **not NO-GO** because every gate that *could* be run (type-check, lint, build, 357+ unit/integration tests, live schema-wide RLS coverage, live HR policy text) is green, and the one real open security finding (over-permissioned functions) fails safely rather than being exploitable today.

A GO here is a statement of technical readiness for the narrow scope above, once blocker #1 closes — it does not authorize deployment, pricing changes, or billing real customers, per this mission's own boundaries.
