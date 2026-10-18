# Mastra Installation — Verification Report

**Date:** 2026-10-17 · **Engineer role:** AI Infrastructure
**Where:** isolated git worktree `/Users/macbookpro/mastra-worktree` · branch **`chore/mastra-install`** (based on committed `feature/frontend-operating-system` HEAD `eeaa028`)
**Why isolated:** the active agent has uncommitted `package.json` + `package-lock.json` changes in the main checkout; installing there would overwrite their work. The worktree has its own `node_modules`, so the running dev server on **:8080 was never interrupted** (verified HTTP 200, same Vite PID, before/during/after).

---

## Dependency versions (installed, exact)
| Package | Version | Notes |
|---|---|---|
| `@mastra/core` | **1.78.0** | engines `node >=22.13.0`; peer `zod ^3.25 || ^4.0` |
| `mastra` (CLI) | **1.34.2** | dev CLI |
| `ai` (AI SDK) | 6.0.256 | already in project; provides `ai/test` mock models |
| `zod` | 4.3.6 | already in project — peer-compatible ✅ |
| `typescript` | 5.8.3 | already in project |
| `@types/node` | 22.16.5 | already in project |
| Node.js | **v25.7.0** | ≥ 22.13 required ✅; runs `.ts` via native type-stripping |
| npm | 11.10.1 | project's live package manager (chosen over bun — the active branch edits `package-lock.json`) |

Install command (in the worktree):
```bash
npm install @mastra/core@1.78.0 mastra@1.34.2 --no-audit --no-fund   # added 905 packages, exit 0
```

No API keys hardcoded. Model access is provider-agnostic via env (reusing the app's existing `LOCAL_LLM_BASE_URL` / `LOCAL_LLM_MODEL` / `LOCAL_LLM_API_KEY` contract).

---

## What was created (isolated, foundation only)
```
src/mastra/
├── index.ts                     # minimal Mastra registry (1 agent, mock model by default)
├── model.ts                     # provider-agnostic model wiring + deterministic mock
├── agents/diagnostic-agent.ts   # single isolated diagnostic agent (no tools, no data, no side effects)
└── verify.ts                    # runtime verification runner (mock invocation)
docs/ai/
├── MASTRA_AGENT_MAP.md          # Phase-4 planning (no department agents implemented)
└── MASTRA_INSTALL_VERIFICATION.md
```
No existing AI agent, UI, route, DB schema, or edge function was modified. `src/mastra` is **not imported by the Vite client**, so it never enters the browser bundle.

---

## Verification results

### 1. Mastra loads + diagnostic agent invocation (deterministic mock) — ✅ PASS
```bash
node src/mastra/verify.ts
```
```json
{
  "mastraLoaded": true,
  "diagnosticRegistered": true,
  "agentName": "diagnostic",
  "mockReply": "pong",
  "mockInvocation": "PASS",
  "liveInference": "NOT TESTED (no LOCAL_LLM_BASE_URL configured)"
}
```
(A benign warning — "No `storage` configured … in-memory store" — is expected for a foundation install; a persistent adapter is a later concern.)

### 2. Live model inference — ⛔ NOT TESTED (by design, honest)
No model credentials are configured in this environment, and wiring the app's OpenAI-compatible endpoint into Mastra needs an OpenAI-compatible provider package (see Remaining dependencies). Per the mission, installation is validated with a deterministic mock and **live inference is explicitly NOT TESTED** — not claimed as working.

### 3. Typecheck & build — re-run 2026-10-18 (current session)
Re-verified per-step in the worktree. During this re-run the Mastra API (`@mastra/core` 1.78 / AI SDK v6) surfaced three type errors in the foundation that the earlier combined run had not caught; all three were fixed **inside `src/mastra` only**:
- `diagnostic-agent.ts` — `new Agent({...})` now requires an `id` field → added `id: "diagnostic"`.
- `model.ts` — AI SDK v6 changed the mock result shape: `finishReason` is now an object `{ unified, raw }` (not the string `"stop"`), and `usage.inputTokens`/`outputTokens` are now nested objects. Updated the mock accordingly.

Results after the fixes:
- **Mastra-scoped typecheck: CLEAN** — `npx tsc -b tsconfig.json --noEmit` reports **0 errors in `src/mastra`**.
- **`npm run build` (Vite production): ✅ SUCCEEDS** — "✓ built in 16.53s". The Vite build uses esbuild type-stripping, so it is green.
- **Full-project `npm run type-check` (strict `tsc -b`): FAILS with 3 errors — NOT in Mastra code.** They are pre-existing in another agent's files and reference an `invitations.token` column that does not exist in the generated Supabase types (the column is `token_hash`):
  - `src/pages/app/admin/AdminEmployees.tsx:100`
  - `src/pages/app/admin/AdminUsers.tsx:101`
  - `src/pages/app/settings/InvitationsPage.tsx:46`
  The identical code exists in the main checkout (`~/Ai-Agency-Danmarkreal`), confirming these are pre-existing and outside this task's ownership. **Not fixed** (strict rule: do not touch the other agent's files). Logged as a blocker in `docs/ai/OWNER_DECISIONS.md`.
```bash
cd /Users/macbookpro/mastra-worktree
node src/mastra/verify.ts        # mock PASS, mockReply "pong"
npx tsc -b tsconfig.json --noEmit # 0 errors in src/mastra; 3 pre-existing errors in admin/invitation files
npm run build                     # ✓ built in 16.53s
```

### 4. Existing app unaffected — ✅ (re-verified 2026-10-18)
- `curl localhost:8080` → **200** during and after the work.
- Same Vite process (**PID 46087**, `~/Ai-Agency-Danmarkreal/node_modules/.bin/vite`) still running; main checkout working tree untouched; all Mastra work is in the isolated `~/mastra-worktree` with its own `node_modules`.

---

## Remaining dependencies / blockers (to go from foundation → live)
1. **OpenAI-compatible provider** — to call the app's real endpoint, add `@ai-sdk/openai-compatible` and build the model from `liveModelConfig()` (`LOCAL_LLM_BASE_URL`/`MODEL`/`API_KEY`). Then run one real completion to flip live inference from NOT TESTED → PASS. _(Not added yet to keep the install minimal.)_
2. **Model credentials** in the environment (`LOCAL_LLM_BASE_URL` + `LOCAL_LLM_MODEL`, currently OpenRouter in production) for a live smoke.
3. **Persistent storage adapter** (`@mastra/libsql` or `@mastra/pg`) before any stateful/department agent — not needed for the diagnostic foundation.
4. **Dependency integration** — when ready, merge the `chore/mastra-install` branch's `package.json`/lockfile additions into the main branch carefully (coordinate with the active agent; do not clobber their lockfile).

## Startup / dev commands
```bash
# From the worktree:
node src/mastra/verify.ts        # re-run the mock verification
npx mastra dev                   # (optional) Mastra dev playground — not run here; needs a live model
```

## Strict-rules compliance
- Production untouched · other agent untouched (separate worktree + node_modules) · existing architecture not replaced · nothing pushed/deployed · live model **not** claimed to work (NOT TESTED) · no untested component marked PASS.
