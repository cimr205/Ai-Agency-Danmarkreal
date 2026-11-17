# Growth OS Skill Engine: audit and gap analysis

Date: 2026-11-14. Branch: `feature/growth-os-skill-engine`, a worktree cut from `feature/dialer-calendar-design-and-errors` @ `962ee48`.

## Repository state found

- The main checkout has 22 modified and about 15 untracked paths that are not committed (App.tsx, package.json, messages/*, landing pages, docs). **None of them were touched.** All Growth OS work is in a separate git worktree on a new branch.
- There is no `AGENTS.md`. `CLAUDE.md` describes the app: React 18, Vite, shadcn, and Supabase direct with RLS. It has about 60 Deno edge functions. i18n is en/da/de.

## What exists and is reused

| Area | Existing | Reuse |
|---|---|---|
| LLM provider | `_shared/aiConnection.ts`: one platform-level OpenAI-compatible endpoint (OpenRouter today) from `LOCAL_LLM_*` secrets, with a `models` fallback list capped at 3 | Growth OS uses the **same secrets** and the same `describeOpenAIError`. It adds a gateway around them for cost, budget, retries and logging. |
| Model routing | `_shared/operatingModelRouter.ts` (fast/reasoning tiers); `src/mastra/model-router.ts` (complexity → class, BLOCKED instead of a silent downgrade) | The same policy idea: a task needs a minimum model class, and a blocked result is never downgraded. |
| Mastra | `@mastra/core` 1.78 with one diagnostic agent and 26 department agent files under `src/mastra/agents` (CRM/HR/marketing/finance). It runs only in Node verification scripts and is **not deployed**. | Not the runtime for Growth OS. The production runtime is the edge functions. Mastra stays the dev and verification layer. |
| Auth/tenancy | `requireCompanyAuth` (`_shared/auth.ts`), `get_user_company_id()`, `is_company_admin()`, `user_roles` | Every Growth OS table and RPC is scoped by these. |
| Approvals/audit | `ai_operating_manager` actions with `risk` levels, `ai_action_audit`, `autopilot_actions`, `workflow_runs` | Growth OS uses its own levels 0–3 and maps them onto the existing low/medium/high/critical risk scale. |
| Analytics | `product_events` (5 activation events), `capability_usage` | Read-only inputs for later specialists (Funnel/Activation). |
| Testing | vitest (frontend), `deno test` for `_shared/*_test.ts`, Playwright and axe-core already installed | Deno tests for the engine. PGlite runs the migration in real Postgres in WASM, so RLS is tested without Docker. |

## Gaps (before this branch)

1. There was no agent registry, no skill concept and no skill versioning.
2. There was no persistent task queue with leases or idempotency for agents. The `workflow_runs` table is workflow-specific.
3. There was no per-tenant LLM budget, and no token or cost log per call.
4. There was no independent verification step and no learning or improvement records.
5. There was no Growth OS UI.
6. Docker is not running here, so `supabase start` is unavailable. The RLS tests use PGlite instead.
7. The OpenRouter key exists only as a Supabase secret (`LOCAL_LLM_API_KEY`), not locally. A live LLM call from this machine is not possible without that key.

## Risks

- Applying the migration or deploying the edge function to the **production** Supabase project is a Level 3 action (production deploy). It is **not done** on this branch and needs your explicit approval.
- External skill repos: see `growth-os/skills/external/MANIFEST.md`. The Mastra skill tells agents to post feedback to mastra.ai autonomously, and `web-design-guidelines` fetches unpinned instructions from `main` at runtime. Both are blocked.
- The OpenRouter and Vercel skill repos have no repo-level licence file, so their content is referenced, not vendored.

## Implementation order (Phase 1)

1. The registry (6 CEOs, 35 specialists and 35 verifier subagents, about 140 skill contracts) as validated TypeScript data, shared by the edge function and the UI.
2. The external skill manifest, pinned to commits, with scan findings.
3. The OpenRouter gateway: catalogue-driven model choice, budget, retries, timeouts, cost logging and JSON validation.
4. The migration: tables, RLS, the lease/claim RPC, idempotency, server-side budget and approval integrity.
5. The engine: OBSERVE → PLAN → EXECUTE → VERIFY → EVALUATE → LEARN → report → CEO. The SEO on-page audit is the first vertical, because it needs no customer OAuth data: a public URL is enough.
6. The `growth-os` edge function as the runtime.
7. UI: Command Center, agents, agent detail, skill library, approvals, activity, budget and audit.
