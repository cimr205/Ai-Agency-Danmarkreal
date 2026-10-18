# Mastra Core — Status

**Last updated:** 2026-10-18 · see `MASTER_STATE.md` for the evidence ledger and next tasks.

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

## Not built yet (nothing below exists)
- Shared agent registry beyond the diagnostic agent
- Memory interface
- Provider-neutral model-router with live provider (`@ai-sdk/openai-compatible` not installed)
- Specialist-agent routing
- Approval / role / audit / idempotency bridge to `ai-operating-manager`

## Integration constraints (from the agent map)
- Agents run server-side behind `requireCompanyAuth`; RLS is never bypassed.
- Mastra tools propose actions; the Action Registry authorizes and executes. Action names and `risk` levels (`low|medium|high|critical`) reuse the existing definitions.
- Email HTML and other attacker-controlled text must be sanitized before entering model context.

## Status of this iteration
Shell execution unavailable (classifier outage), so no tests, typecheck, build or commit ran. No status above is upgraded to PASS.
