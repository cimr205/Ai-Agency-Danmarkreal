# CRM & Sales Agents — Status

**Owner:** CRM-agents loop (MASTERPROMPT 2) · **Worktree:** `/Users/macbookpro/crm-agents-worktree` · **Branch:** `feature/crm-agents` (based on `feature/frontend-operating-system` @ `eeaa028`)
**Depends on:** the Mastra platform (`chore/mastra-install`, commit `6407118`) — CRM agents are specialist agents on that platform, not a new chatbot.
**Last updated:** 2026-10-18 (iteration 1 — read-only inventory; no code written yet)

## Hard rules
- No new execution system. Every mutation goes through the existing Action Registry (`supabase/functions/ai-operating-manager`). No direct DB writes from an LLM.
- Reuse the existing REST API (`src/lib/api.ts`), Supabase data models, auth and RLS.
- Per-action mode is the owner's: **OFF** / **DRAFT_APPROVAL** / **AUTO**. Default = DRAFT_APPROVAL (propose → human approves).
- No spam, no cold email without a legal basis, no fabricated lead data. No real external sends in tests.
- Do not touch the other agent's files; no push, no deploy.

## Inventory (verified read-only, 2026-10-18)

### Existing CRM/sales surface
- **Pages** (`src/pages/app/crm/`): `Leads.tsx`, `LeadsPage.tsx`, `CustomersPage.tsx`, `DealsPage.tsx`, `IcpPage.tsx`, `LeadGenerationPage.tsx`.
- **API hooks** (`src/hooks/api/`): `useLeads`, `useDeals`, `useDealActivity`, `usePipeline`, `usePipelineStages`, `useTasks`, `useLeadGen`.
- **Edge functions** (sales-relevant): `lead-ai-recommend`, `lead-generation-chat`, `lead-gen-api`, `csv-import-leads`, `deal-coach`, `ai-email-writer`, `verify-emails`, `process-email-queue`, `process-campaign-email-jobs`, `email-provider-webhook`, `email-track`, `meta-leadgen-webhook`.

### Action Registry — the execution contract (`ai-operating-manager/index.ts`, 17 actions)
Each action: `requiredRoles`, `requiredFields`/`optionalFields`, `risk` (low|medium|high|critical), `connector` (internal|email.send|integration), `rollback`.
Governance already implemented:
- `requireCompanyAuth` → `companyId` + roles (tenant isolation; RLS enforced).
- `proposeAction` → row in `autopilot_actions`, `status: "awaiting_approval"`, **idempotency_key** (dedupe on `(company_id, idempotency_key)`).
- `audit()` → `ai_action_audit` (proposed / approved / rejected / edited / executed, before→after).
- Lifecycle: proposed → awaiting_approval → approve | reject | edit → execute, with **idempotent replay** (returns `idempotentReplay: true` if already executed).

CRM-relevant actions that already exist (reuse, do not recreate):
| Action | Roles | Risk |
|---|---|---|
| `tasks.create` / `tasks.complete` | member / member | low / medium |
| `crm.lead.create` / `crm.lead.move_stage` | member | medium |
| `crm.customer.create` / `crm.customer.update` | member | medium |
| `crm.deal.create` | manager | medium |
| `crm.deal.move_stage` | manager | high |
| `calendar.event.create` / `.update` | member | medium |
| `invoice.create` | manager | high |
| `marketing.campaign.create` | manager | medium |
| `email.send` | member | (connector email.send) |

## Mode mapping (how OFF/DRAFT_APPROVAL/AUTO ride on the registry)
- **OFF** — agent does not propose the action at all.
- **DRAFT_APPROVAL** (default) — agent calls `proposeAction` → `awaiting_approval`; a human approves/edits/rejects. Nothing executes without approval.
- **AUTO** — only policy-permitted low-risk actions auto-approve; high/critical always require a human. Requires an explicit owner policy before enabling (see OWNER_DECISIONS).

## Gaps to close (each a future bounded task, one verified action at a time)
1. **Explainable ICP lead scoring 0–100** — `IcpPage`/`lead-ai-recommend` exist; need a documented, deterministic scoring contract (criteria + weights surfaced to the user), not a black-box number.
2. **Company discovery from lawful public data** — no source-registry today; must record data sources + dedupe before any lead is created, and only via permitted integrations.
3. **Stalled-deal detection + daily sales brief** — `deal-coach` exists; need a read-only brief generator grounded in real tenant aggregates.
4. **Deal→customer→task→quote/invoice hand-off** — actions exist individually; need an orchestrated, approval-gated flow.
5. **Mastra tool → Action Registry bridge** — a Mastra tool that can only *propose* (no DB client in tool scope). Blocked on the shared tool-interface task in `MASTER_STATE.md` (platform side).

## Next action (iteration 2)
Write the Mastra→Action-Registry *propose-only* tool contract (types + a unit test proving a tool cannot write to the DB directly), on `feature/crm-agents`, then run typecheck + the new unit test. No live sends, no DB writes.

## This iteration — evidence
Read-only inventory only. No code changed, no DB touched, nothing proposed or executed. Worktree `feature/crm-agents` created off `eeaa028`; this file is the only change. `localhost:8080` untouched (owned by the other agent; verified 200 earlier this session).
