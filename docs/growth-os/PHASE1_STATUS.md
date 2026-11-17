# Growth OS: Phase 1 status (2026-11-14)

Branch `feature/growth-os-skill-engine` (worktree `../Ai-Agency-Danmarkreal-growth-os`). Nothing is deployed and nothing is committed. The main checkout and its uncommitted changes were not touched.

## Implemented and working

| Part | Where | Evidence |
|---|---|---|
| Registry: 1 Global CEO, 5 department CEOs, 35 specialists and 35 verifier subagents, each a full profile (identity, responsibility, skills, tools, model policy, data sources, experiment method, quality criteria, report format, skill version, budget, allowed actions, approval levels) | `supabase/functions/_shared/growth-os/registry/` | `registry_test.ts` |
| 142 project skill contracts. 2 are **active** (`onpage-seo-audit`, `seo-experiment-verification`); 140 are **draft** (contract only) | `registry/skills.ts` → `growth-os/skills/custom/*/SKILL.md` (generated, `--check` keeps them in sync) | generator `--check` |
| Agent → skill manifest | `growth-os/registry/manifest.json` | generated |
| External skills: 10 repos verified and pinned to commit SHAs, 4 agent-skill repos fetched and scanned | `registry/external-skills.ts`, `growth-os/skills/external/MANIFEST.md` | `registry_test.ts` (SHA format) |
| OpenRouter gateway | `openrouter.ts` | `engine_test.ts` |
| Engine: OBSERVE → PLAN → EXECUTE → VERIFY → EVALUATE → LEARN → report → department CEO | `engine.ts` | `engine_test.ts` |
| SEO on-page audit (13 deterministic checks, SSRF guard, redirect re-check) | `seo/onpage.ts` | fixtures plus a real run |
| Database: queue with idempotency, leases, checkpoints, max attempts and dead state; activity; model usage; budgets; reports; learning records; version-locked approvals; append-only audit log; RLS | `supabase/migrations/20261114120000_growth_os_foundation.sql` | `sql_rls_test.ts` (PGlite) |
| Runtime: **one Railway service** (`growth-os` project, personal workspace, created 2026-11-15) that polls the queue, runs tasks and exposes `GET /health`. It goes IDLE when the queue is empty and finishes the current task on SIGTERM. Users enqueue via the `growth_enqueue_task` RPC; the edge function was removed. | `growth-os/service/`, `supabase/functions/_shared/growth-os/worker.ts`, `scripts/growth-os/railway-bundle.sh` | `worker_test.ts`, `health_test.ts`; **live** at https://growth-os-production-413e47cc.up.railway.app/health (state idle, llm configured, 2026-11-15) |
| UI: Command Center, Global CEO, Departments, All Agents, Agent detail (11 tabs), Live Activity, Skill Library, Learning Center, Approvals, Budget & Usage, Audit Log, Settings. Experiments and Analytics say "not implemented" | `src/pages/app/growth-os/GrowthOsPage.tsx`, `src/hooks/api/useGrowthOs.ts` | `GrowthOsPage.test.tsx` |

## Verified

| Test | Result |
|---|---|
| `deno test` growth-os (registry 5, engine 10, Claude + Ollama routing 11, SQL/RLS 6, worker 6, health 4) | **42/42 pass** |
| vitest, whole repo, with placeholder `VITE_SUPABASE_*` (the worktree has no `.env.local`) | **54 files, 427 pass**, 27 skipped (pre-existing) |
| vitest without env vars | 3 pre-existing files fail with "supabaseUrl is required" (env only, unrelated) |
| `npm run type-check` | pass |
| eslint (changed frontend files) | pass |
| `deno lint` (growth-os) | pass, except `no-import-prefix`, which the whole repo's `https://` import convention also hits |
| `vite build` | pass (GrowthOsPage chunk 62 kB, 18 kB gzip) |
| **Real run** (`scripts/growth-os/dry-run.ts`) against https://aiagencydanmark.dk/ and /da | completed, verifier **verified**, score 0.75. Real finding: the server HTML has **no h1, 0 internal links and 10 words**, so the content is client-rendered only. |

The SQL tests prove:
- Company 2 cannot read or update company 1's tasks, events or audit log.
- An employee cannot enqueue a task.
- Direct inserts are refused.
- Clients cannot call claim or reserve.
- The same idempotency key returns the same task.
- `SKIP LOCKED` hands a task to one worker only; an expired lease is reclaimable, and the old worker cannot finish the task.
- Max attempts lead to `dead`.
- The daily budget is enforced atomically and per company.
- Approvals: another company or an employee cannot approve. A rejected request or an altered payload hash never executes, and an approval is used once.
- The audit log is append-only.

## Not done, and why

| Item | Status |
|---|---|
| Apply the migration | **Applied** 2026-11-15 by the owner in the Supabase SQL Editor (the MCP tool was declined). Verified: 9 tables with RLS and one read policy each; queue and budget RPCs are service-role only. |
| Live OpenRouter call | **Not tested.** The key exists only as a Supabase secret. The gateway is tested against a fake OpenRouter (catalogue, 429 retry/backoff, fallback, budget refusal, invalid JSON). |
| Model classes | **Owner decisions 2026-11-14:** (1) hard tasks run on Claude: `complex` tasks (department and Global CEO decisions) use the newest `anthropic/claude-sonnet-*`, then the newest `anthropic/claude-opus-*`, resolved from OpenRouter's live catalogue, with no hard-coded version. (2) **If Claude isn't there** (none in the catalogue, all Claude calls fail, or OpenRouter is down), they go to the **self-hosted Ollama on Railway** (`GROWTH_OS_OLLAMA_BASE_URL` (https only), `GROWTH_OS_OLLAMA_MODEL`, optional `GROWTH_OS_OLLAMA_API_KEY`, and `reasoning_effort` defaulting to `none`, which Qwen needs). They never use another OpenRouter provider. **Status:** no Ollama service exists on Railway today. I checked all 5 projects: `backend`/crater-ai-gateway is an Express app, `jarvis` is a Python server, and the rest are the shop and trading bot. It was most likely removed when AI moved to OpenRouter (commit `21f27b7`). Until an Ollama URL is set, complex tasks without Claude are BLOCKED. Simple and standard tasks still use the cheapest allowed model. Not tested live. |
| Global CEO loop | Registered: it receives `escalateToGlobal`, but there is no autonomous cross-department prioritisation yet (Phase 4). |
| 34 specialists | **Registered only**: profiles and draft skill contracts exist, with no executor. The SQL `growth_executable()` refuses them. |
| Phase 2 (skill versions table, evaluation runs, candidate comparison, rollback) | Not started. Learning records are stored and are explicitly `not_evaluated`. |
| Ollama on Railway | Found in the **Crm** workspace (`crater-crm-ollama`, `ai-operating-manager-ollama`). Both are offline because the workspace trial expired, so the fallback stays unset. |
| UI in a browser | Only rendered in tests. The app needs a login against production Supabase, which I don't do. |
| Merge into your branch | Not done. This branch edits `App.tsx` (1 route), `AppSidebar.tsx` (1 nav item) and `messages/{en,da,de}.json` (a new `growthOs` block). Your main checkout has uncommitted edits in `App.tsx` and `messages/*.json`, so expect small merge conflicts there. |

## Security enforced
- Levels 0–3 are mirrored in SQL (`growth_action_level`). Unknown actions are Level 3.
- Specialists may act autonomously up to Level 1; CEOs up to Level 2. Level 3 needs owner or company_admin via `growth_decide_approval`, bound to a SHA-256 of the payload.
- The budget is checked server-side before every model call (worst case from live catalogue prices), with a platform cap of 1 USD/day in Phase 1.
- `provider.data_collection: "deny"` is sent to OpenRouter. The key stays server-side, and model output is validated before use.
- Fetched pages and external SKILL.md files are treated as data. Two external skills are blocked or partly excluded: Mastra's autonomous feedback POST, and Vercel's unpinned remote rules.

## Next milestone (smallest step towards paying customers)
Approve applying the migration and deploying `growth-os`, then fix the finding above. Server-render or prerender the h1, text and internal links on aiagencydanmark.dk's landing pages, so search engines and AI crawlers can read the offer. Then measure it with Search Console, which `search-console-analysis` needs anyway.

## Update 2026-11-17: analytics, SEO opportunities, role helpers
- GA4 + Search Console sync in the Railway service, per-company connections with system_admin activation, SEO agent `seo.opportunities`, Analytics dashboard (Overview, SEO performance, AI recommendations, Business impact). See `ANALYTICS.md`.
- `growth_can_approve` / `growth_can_operate` now answer only about the caller, check the tenant, and are not callable by anon.
- Migration `20261117130000_growth_os_analytics.sql`; tests: `analytics_sql_test.ts` (7), `google_test.ts` (5), `analytics_sync_test.ts` (3), `seo/opportunities_test.ts` (8), `seo/opportunities_runner_test.ts` (3), vitest `analytics-metrics.test.ts` (6) and `AnalyticsDashboard.test.tsx` (6).
