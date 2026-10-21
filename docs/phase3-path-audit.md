# Phase 3 competing-path audit

## KEEP

- `crm_activities` browser writes: user-authored notes, calls and follow-ups are the canonical CRM activity records, protected by tenant RLS. They are not canonical business-event emission.
- `workspace_events` reads in Autopilot/monitoring: read-only consumers of the canonical ledger.
- database trigger publishers and service-only provider RPCs: authoritative state-transition producers.
- `webhook-dispatch` test invocation: explicitly scoped webhook delivery test, not a business-state mutation.

## MIGRATE

- AI action and interactive workflow audit writes now emit canonical service-side events and reach `activity_logs` only through the timeline projection.
- Gmail outbound/inbound paths now persist provider identity and use exact message/thread continuity before deterministic contact context.
- Meta, Stripe and workflow-created records use nullable `created_by` plus `workspace_events.actor_type=system`; they no longer select an arbitrary company administrator.
- default tenant workflows now instantiate from global versioned configuration without embedding tenant IDs.

## REMOVE

- browser `fireWebhookEvent` calls after lead, deal and task writes, including `lead.updated` and `task.completed` double-fire paths.
- browser-observed Twilio status changes writing directly to `activity_logs`.
- profile-triggered workflow seeding that attributed system workflows to whichever profile happened to be inserted first.
- invoice matching by the public invoice payment UUID; Stripe now resolves a short-lived, one-use hashed reference bound to the checkout session.

No active frontend path inserts `workspace_events` or `activity_logs`. Direct deal stage updates use `transition_deal_stage`; provider/service mutation RPCs remain denied to `anon` and `authenticated`.
