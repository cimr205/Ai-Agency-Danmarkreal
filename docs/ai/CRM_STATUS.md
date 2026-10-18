# CRM & Sales Agents — Status

**Owner:** CRM-agents loop (MASTERPROMPT 2) · **Worktree:** `/Users/macbookpro/crm-agents-worktree` · **Branch:** `feature/crm-agents` (based on `feature/frontend-operating-system` @ `eeaa028`)
**Depends on:** the Mastra platform (`chore/mastra-install`, commit `6407118`) — CRM agents are specialist agents on that platform, not a new chatbot.
**Last updated:** 2026-10-18 (iteration 6 — personalized email DRAFT proposer, lawful-basis gated)

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

## Done
- **Iteration 1** — read-only inventory + Action Registry contract (commit `5525210`, this branch).
- **Iteration 2** — propose-only tool bridge `createActionProposer` built on the **platform** branch `chore/mastra-install` (commit `316e867`): `src/mastra/tools/action-proposal.ts` + `src/test/mastra-action-proposal.test.ts`, **7/7 passing**, typecheck clean. Proves a tool holds no DB client and can only propose into the registry; OFF/DRAFT_APPROVAL/AUTO gating, AUTO limited to low-risk. (Built on the platform branch because `@mastra/core` + `node_modules` live there; it is the shared tool-interface every specialist agent reuses.)

- **Iteration 3** — lead prioritizer + propose-only follow-ups (platform commit `166caf4`): `src/mastra/agents/crm/lead-prioritizer.ts` + test (**7/7 passing**, typecheck clean). Important: it **reuses** the existing `icp-score` edge function (the explainable 0–100 scorer with match_reasons/red_flags, persisted to `lead_icp_scores`) — it does **not** re-score, to avoid a parallel execution path. It ranks already-scored leads by threshold and proposes a `tasks.create` DRAFT per top lead (idempotency keyed per lead), carrying the explainable reasons. No DB client, no scoring, no sends.

- **Iteration 4** — stalled-deal detector + daily sales brief (platform commit `2993112`): `src/mastra/agents/crm/stalled-deals.ts` + test (**5/5 passing**, typecheck clean). Flags non-terminal deals idle past a threshold (by `updated_at`), builds a brief aggregated only from real deal rows (no fabricated metrics), proposes a `tasks.create` nudge per stalled deal via the bridge. No writes, no sends.

- **Iteration 5** — deal→customer→task→invoice hand-off (platform commit `40e172b`): `src/mastra/agents/crm/deal-handoff.ts` + test (**6/6 passing**, typecheck clean). `planHandoff` orders the steps for a won deal; `proposeHandoff` submits only the proposable ones. Honours registry required fields (customer.create: name+email; invoice.create: customer_id+amount). When data is missing it returns steps as **blocked** (no customer data) or **deferred** (invoice needs a customer id that only exists after approval) instead of fabricating values. Nothing auto-executes.

## CRM capability coverage so far (all propose-only, tested)
lead prioritization (reuses icp-score) · stalled-deal detector + daily brief · deal→customer→task→invoice hand-off. Remaining HOVEDMÅL items: company discovery (lawful public data + dedupe + source registry), personalized email drafts, lawful follow-up sequences, reply sync, pipeline-update suggestions, future calling prep.

- **Iteration 6** — personalized email DRAFT proposer (platform commit `1058305`): `src/mastra/agents/crm/email-drafter.ts` + test (**5/5 passing**, typecheck clean). Personalizes from real fields only, refuses cold outreach without a lawful basis, and proposes a `tasks.create` holding the body — never `email.send`. Missing fields omitted, not guessed. Sending stays a separate human-approved step.

## Next action (iteration 7)
**Company discovery + dedupe + source registry** (lawful public data): wrap the existing `cvr-search`/`companies-house-search` as read-only lookups, dedupe candidates against existing `leads` (by normalized name/CVR), record the data source per candidate, and propose `crm.lead.create` DRAFTs only for net-new, lawfully-sourced companies (no fabricated contact data). Unit tests for dedupe + source recording + that unknown/missing data is never invented.

## Evidence / safety
No DB touched, nothing proposed or executed against real data, no external sends. `localhost:8080` untouched (other agent's; verified 200 this session). No push, no deploy.
