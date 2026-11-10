# AI Agent Verification — CRM agents, idempotency — 2026-11-10

## Finding: `feature/crm-agents` (standalone branch, 199 ahead / 14 behind `origin/main`) appears superseded

The CRM agent capability this branch was built to deliver — propose-only Mastra agents (lead prioritizer, stalled-deals nudger, deal handoff, follow-up sequencer, pipeline suggester, email drafter, reply-sync, company discovery) plus a dedicated cross-module **idempotency-key collision guard** — is **already present and passing on the active branch** (`feature/dialer-calendar-design-and-errors`, tip `ac08e29`), via `src/test/crm-idempotency-collisions.test.ts` and the `src/mastra/agents/crm/*` modules it imports.

The standalone branch and the active branch share a common ancestor (`eeaa028`) well before either's tip — they are **divergent, independently-evolved lines that arrived at overlapping functionality**, the same pattern found with `feat/ai-free-model-fallback` in the 2026-11-08 pass (that branch turned out to be superseded by a better version already on `main`).

## What was verified (on the active branch, already shipped)

- **Idempotency**: `crm-idempotency-collisions.test.ts` deliberately reuses the same lead/deal ID across every CRM proposer capability and asserts every generated idempotency key is globally unique (each capability namespaces its own keys) — this is exactly the mission's §8.2 requirement ("samme logiske handling udføres højst én gang... uden at legitime nye handlinger blokeres"), already implemented as a server-side-dedupe-key scheme (`(company_id, idempotency_key)`), not an in-memory guard.
- **Propose-only / approval-gated flow**: every CRM agent capability goes through `createActionProposer()`, which returns `{status: "awaiting_approval"}` rather than executing directly — matching the mission's §8.3 required flow (AI proposes → rights checked → user approves → server validates → action executes → audit).
- Confirmed passing in this session's full test runs (both the isolated onboarding-series verification and the combined-integration branch runs): `crm-idempotency-collisions.test.ts`, `crm-lead-update.test.ts` (14 tests), `crm-lead-prioritizer.test.ts`, `crm-stalled-deals.test.ts`, `crm-deal-handoff.test.ts`, `crm-followup-sequence.test.ts`, `crm-pipeline-suggester.test.ts`, `crm-email-drafter.test.ts`, `crm-reply-sync.test.ts`, `crm-company-discovery.test.ts` — all green, 0 failures.

## What was not done

- A line-by-line diff between the standalone `feature/crm-agents` branch and the active branch's equivalent modules, to confirm the standalone branch has zero unique capability worth cherry-picking. Given the branch is 199 commits deep and the active branch already has a tested, passing, superset-looking implementation of the same feature set, a full diff was judged lower priority than the remaining P0/P1 items in this session's time budget.
- Live/E2E verification of the approval step itself (does a human clicking "approve" in the UI actually call the right server-side validator before the action executes?) — this requires a running app + authenticated session, which per `docs/launch/SECURITY_REPORT.md`'s constraints was not set up against the live project in this pass.

## Recommendation

Do not merge `feature/crm-agents` as-is — it would very likely reintroduce duplicate/conflicting CRM agent modules against what's already shipped. Before deleting it, a dedicated pass should diff `src/mastra/agents/crm/*` between the two lines to confirm nothing in the 199-commit branch (e.g. a specific capability like company-discovery's data sourcing logic) is meaningfully different or more complete than what's live. **Parked, not deleted**, pending that check — see `docs/launch/BRANCH_INVENTORY.md`.
