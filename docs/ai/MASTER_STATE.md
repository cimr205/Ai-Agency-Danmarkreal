# AI Agency Danmark — Mastra Core: Master State

Read this file and `CORE_STATUS.md` at the start of every loop iteration; update both at the end.

**Last updated:** 2026-10-18 (iteration 1 — shell restored; foundation re-verified and fixed; committing)
**Worktree:** `/Users/macbookpro/mastra-worktree` · branch `chore/mastra-install` (based on `feature/frontend-operating-system` @ `eeaa028`)
**Main checkout (other agent, do not touch):** `/Users/macbookpro/Ai-Agency-Danmarkreal` · branch `feature/frontend-operating-system` · localhost `:8080`

## Rules in force
- No reset / stash / force-push / process kill / overwrite of the other agent's files; no change to the `:8080` process.
- No production deploy, payments or push. No fabricated free/unlimited AI resources.
- No direct DB writes from an LLM: every mutation goes through the authorized, tenant-isolated Action Registry (approval, role checks, audit, idempotency, verification).
- Never mark an untested component PASS.

## Evidence ledger (what is actually proven)
| Item | Status | Evidence / date |
|---|---|---|
| `@mastra/core` 1.78.0 + `mastra` CLI 1.34.2 in `package.json` | PRESENT | `git diff package.json` = only these 2 lines added, 2026-10-18 |
| `src/mastra/` registry + diagnostic agent + provider-neutral env wiring | PRESENT | files read + typecheck clean, 2026-10-18 |
| Mock invocation (`node src/mastra/verify.ts`) | **PASS** | mockReply "pong", re-run 2026-10-18 |
| Mastra-scoped typecheck (`src/mastra`) | **CLEAN (0 errors)** | `npx tsc -b --noEmit`, 2026-10-18, after fixing 3 Mastra-API type errors (id field; v6 finishReason/usage shapes) |
| `npm run build` (Vite production) | **✅ SUCCEEDS** | "✓ built in 16.53s", 2026-10-18 |
| Full strict `npm run type-check` | **FAILS — 3 pre-existing errors, NOT in Mastra** | `invitations.token` vs `token_hash` in AdminEmployees/AdminUsers/InvitationsPage; identical in main checkout; not ours, not fixed |
| `localhost:8080` unaffected | **200**, same Vite PID 46087 | re-checked 2026-10-18 |
| Live inference | **NOT TESTED / BLOCKED** | no model endpoint + credentials (`LOCAL_LLM_*`); `@ai-sdk/openai-compatible` not added — see OWNER_DECISIONS #1,#2 |
| Browser test | NOT TESTED | claude-in-chrome cannot reach this machine's localhost (network isolation); Playwright is the local runner |
| Commit of Mastra foundation | **DONE this iteration** | see git log on `chore/mastra-install` |

## Blocker this iteration
Full strict `npm run type-check` fails on **3 pre-existing errors in another agent's files** (`invitations.token` column missing from generated Supabase types — the column is `token_hash`). The same code exists in the main checkout, so this is not caused by the Mastra work and is outside this task's ownership; it is NOT fixed (strict rule: do not touch the other agent's files). `npm run build` is green regardless. Logged in `OWNER_DECISIONS.md` #6.

## Ownership
| Area | Owner |
|---|---|
| `src/mastra/**`, `docs/ai/**` in the worktree | this agent (Mastra core) |
| Main checkout, `package.json`/lockfile edits there, `:8080` server | other agent — read-only for us |
| Dependency integration into `feature/frontend-operating-system` | joint; needs explicit coordination, see `OWNER_DECISIONS.md` |

## Next tasks (in order, each only after the previous is verified)
1. Re-run in the worktree and record per-step output: `node src/mastra/verify.ts`, `npm run type-check`, `npm run build`, `curl :8080`. Commit the foundation on `chore/mastra-install`.
2. Read the existing Action Registry (`supabase/functions/ai-operating-manager`), `requireCompanyAuth`, and the event bus; write the exact contract (action name, `requiredRoles`, `risk`, `rollback`, idempotency key) into `CORE_STATUS.md`.
3. Add the tool interface: a Mastra tool that can only *propose* an action to the Action Registry (no DB client in tool scope), with tests that a tool cannot write directly.
4. Add the agent registry + model-router (provider-neutral, env-driven; mock default) with unit tests.
5. Add the memory interface (interface + in-memory impl; persistent adapter deferred).
6. Add specialist routing (router agent → department agent stubs) behind tests; do not implement department logic.
7. Regression tests that existing AI action paths still behave identically, then migrate paths incrementally.
