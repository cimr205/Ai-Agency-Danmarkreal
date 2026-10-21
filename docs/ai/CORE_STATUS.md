# Mastra Core — Status

**Last updated:** 2026-10-20 · see `MASTER_STATE.md` for the evidence ledger and next tasks.

## Foundation (exists, from prior session; re-verification pending)
- `src/mastra/index.ts` — registry with one agent (`diagnostic`), mock model by default.
- `src/mastra/model.ts` — `mockModel()` and `liveModelConfig()` reading `LOCAL_LLM_BASE_URL` / `LOCAL_LLM_MODEL` / `LOCAL_LLM_API_KEY` (same env contract as `supabase/functions/_shared/operatingModelRouter.ts`). No keys hardcoded.
- `src/mastra/agents/diagnostic-agent.ts` — no tools, no data access, no side effects.
- `src/mastra/verify.ts` — mock invocation runner.
- Server-side only; not imported by the Vite client.

## Built
- **Tool interface (propose-only) → Action Registry** — `src/mastra/tools/action-proposal.ts`.
  `createActionProposer(submit, modeFor)` returns a frozen object whose only capability is `propose`.
  It holds no DB/Supabase client, so it is structurally incapable of a direct write; it builds an
  `ActionProposal` (with idempotency key) and hands it to an injected transport that, in production,
  POSTs to `ai-operating-manager` (where auth/RLS/idempotency/audit run server-side). Mode gating:
  OFF proposes nothing; DRAFT_APPROVAL always awaits human approval; AUTO requests auto-approval only
  for low-risk actions; unknown actions are rejected. Verified: `src/test/mastra-action-proposal.test.ts`
  — **7/7 passing**, typecheck clean (2026-10-18).

- **Live model provider + verified local inference** (2026-10-20) — `src/mastra/model.ts` `liveModel()`
  builds a real model from `@ai-sdk/openai-compatible` (now installed, 2.0.68) against any
  OpenAI-compatible endpoint. Verified end-to-end against a local **Ollama 0.40.6 + Qwen3.5:2B**:
  diagnostic/Danish/finance/HR/JSON/tool-calling all produced real correct output through the Mastra
  Agent runtime. Qwen3.5:9b/4b are not viable on the 8 GB dev machine (RAM). Details + measurements:
  `OLLAMA_QWEN_LIVE_VERIFICATION.md`. Key fix: thinking models need `reasoning_effort:"none"` on `/v1`.

- **Complexity-aware model router** (2026-10-20) — `src/mastra/model-router.ts` +
  `src/test/mastra-model-router.test.ts` (**14/14**). `resolveModel(complexity)` /
  `resolveModelForTask(taskKind)` pick a model by task complexity from env-registered `small`/
  `standard`/`advanced` slots. The local 2B is registered **only behind `MASTRA_ENABLE_LOCAL_SMALL=1`**
  and is eligible for `diagnostic`/`simple` only; **`complex` never downgrades to 2B — it returns a
  typed `blocked` status**. The registry's diagnostic agent now resolves through the router (mock when
  unconfigured, so the 2B is never a silent global default). How to attach a stronger OSS model later:
  `MASTRA_MODEL_ROUTER.md`.

## Not built yet (nothing below exists)
- Memory interface
- Specialist-agent LLM routing wired into the (currently deterministic) department modules
- Approval / role / audit / idempotency bridge to `ai-operating-manager` (propose-only tool exists; live DB executor BLOCKED on auth test accounts, QA-1)

## Integration constraints (from the agent map)
- Agents run server-side behind `requireCompanyAuth`; RLS is never bypassed.
- Mastra tools propose actions; the Action Registry authorizes and executes. Action names and `risk` levels (`low|medium|high|critical`) reuse the existing definitions.
- Email HTML and other attacker-controlled text must be sanitized before entering model context.

## Status of this iteration
Shell execution unavailable (classifier outage), so no tests, typecheck, build or commit ran. No status above is upgraded to PASS.
