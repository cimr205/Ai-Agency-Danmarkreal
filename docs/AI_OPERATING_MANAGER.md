# AI Operating Manager

The Operating Manager is embedded in the right-hand workspace panel. It is an operational inbox, not a separate chatbot or dashboard.

## Runtime flow

`company data/events → deterministic Signal Engine → priority inbox → proposal → approval/edit/reject → atomic execution → verification → audit`

- Reads and business rules use deterministic code first.
- An OpenAI-compatible self-hosted model is used for ambiguous intent, cross-module analysis and planning.
- All mutation proposals use the central Action Registry in `ai-operating-manager`.
- The browser cannot execute actions or call connector webhooks directly.
- Every side effect requires approval and an atomic database claim.
- A company-scoped idempotency key prevents duplicate execution after refresh, retry, or double-click.

## Existing platform concepts reused

- `workspace_events`: event bus and realtime invalidation.
- `autopilot_actions`: durable action queue and approval state.
- `integrations`: connected-app registry and capability resolution.
- Existing CRM, finance, calendar, task, email and role tables remain authoritative.

The migration adds only the missing concepts: `ai_signals`, structured `ai_company_memory`, `ai_operating_rules`, and `ai_action_audit`, plus execution metadata on the existing action queue.

## Recommended open-source stack

Production uses three separate layers:

1. **LocalAI** is the self-hosted, OpenAI-compatible inference server. It provides authentication, quotas, model management and can run llama.cpp, vLLM or other backends.
2. **Qwen3/Qwen3.5** is the recommended open-weight model family because it supports Danish/multilingual input, structured output and tool use.
3. **The Supabase Action Registry** remains the only component allowed to mutate company data. LocalAI never receives database credentials and cannot bypass approval, RLS or audit.

The Vercel AI SDK packages already installed in the repo are the provider-neutral agent/tool layer. Do not add LangGraph, Dify, Flowise or a second approval engine unless the architecture changes; those would duplicate durable state already implemented in Supabase.

For natural-language plans, configure the model runtime with:

- `LOCAL_LLM_BASE_URL`
- `LOCAL_LLM_MODEL`, or separate `LOCAL_LLM_FAST_MODEL` / `LOCAL_LLM_REASONING_MODEL`
- optional `LOCAL_LLM_API_KEY`

`LOCAL_LLM_BASE_URL` must be a network-reachable HTTPS endpoint from Supabase Edge Functions; `localhost` on a user's Mac or phone cannot serve production traffic. The brief endpoint probes `/models` and reports the AI as online only when the configured model is advertised by the server.

The router sends a bounded, tenant-scoped operating context containing recent CRM records, open deals and tasks, invoices, calendar events, campaigns, employees, leave requests, recruitment and connected integrations. Model output is treated as untrusted data and must match a registered action plus its field schema before a proposal is stored.

## Security boundaries

- Tenant identity comes only from the authenticated server session.
- New AI data is company-scoped with RLS.
- Action inserts and status changes have no browser write policy.
- Approval permissions are checked against server-read roles.
- Connected integrations are resolved again for the same company before proposal and execution.
- External text is data, never authority; it cannot register actions or bypass approval.
- Failed actions retain state and error details and expose an explicit retry path.

## Current action registry

- `tasks.create`
- `tasks.complete`
- `crm.customer.create`
- `crm.customer.update`
- `crm.lead.create`
- `crm.lead.move_stage`
- `crm.deal.create`
- `crm.deal.move_stage`
- `calendar.event.create`
- `calendar.event.update`
- `invoice.create`
- `marketing.campaign.create`
- `hr.employee.create`
- `hr.leave.review`
- `recruitment.position.create`
- `email.send`
- `integration.tool.execute`

New connectors extend the registry and reuse the same approval/execution contract; model prompts never contain connector secrets or implementation details.
