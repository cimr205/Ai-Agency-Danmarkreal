# AI Operating Manager

The Operating Manager is embedded in the right-hand workspace panel. It is an operational inbox, not a separate chatbot or dashboard.

## Runtime flow

`company data/events → deterministic Signal Engine → priority inbox → proposal → approval/edit/reject → atomic execution → verification → audit`

- Reads and business rules use deterministic code first.
- A local OpenAI-compatible model is optional and is only used for ambiguous intent and planning.
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

## Model routing

Core signals and execution work without an LLM. For natural-language plans, configure an OpenAI-compatible local runtime such as llama.cpp, Ollama or vLLM:

- `LOCAL_LLM_BASE_URL`
- `LOCAL_LLM_MODEL`, or separate `LOCAL_LLM_FAST_MODEL` / `LOCAL_LLM_REASONING_MODEL`
- optional `LOCAL_LLM_API_KEY`

The router sends only a compact list of relevant signal fields. Model output is treated as untrusted data and must match a registered action plus its field schema before a proposal is stored.

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
- `crm.customer.create`
- `crm.lead.create`
- `crm.lead.move_stage`
- `crm.deal.move_stage`
- `calendar.event.create`
- `invoice.create`
- `email.send`
- `integration.tool.execute`

New connectors extend the registry and reuse the same approval/execution contract; model prompts never contain connector secrets or implementation details.

