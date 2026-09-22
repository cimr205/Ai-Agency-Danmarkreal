# Operating kernel runtime verification

Run this checklist in a disposable Supabase branch before production deployment.

1. Apply every migration through `20260912000002_connected_business_flows.sql`.
2. Run `supabase db lint --linked` against the disposable branch.
3. Run `supabase/tests/operating_kernel.test.sql` and `supabase/tests/connected_business_flows.test.sql`.
4. Confirm an authenticated member cannot call the event, identity, relationship, worker, or service-only ingestion RPCs and cannot read another tenant's identities/runs.
5. Replay one Meta lead ID twice. Confirm one external identity, one canonical customer/lead, one `marketing.lead_received` event, one workflow run and one follow-up task.
6. Ingest a Meta lead matching exactly one existing normalized email. Confirm reuse. Repeat with two matching leads and confirm the event is marked ambiguous without creating a third record.
7. Sync the same Gmail message twice. Confirm one email/event; verify deterministic sender linking and that a reply cancels only pending follow-up steps for that workspace/contact.
8. Move a deal to `won` twice. Confirm one transition event/run/onboarding task. Move `lost -> won` and confirm the lifetime `deal.won` idempotency key prevents duplicate onboarding.
9. Replay a Stripe charge. Confirm one payment, a paid invoice, customer relationship, payment/invoice events and one downstream run.
10. Inspect `workspace_events`, `workflow_runs`, `workflow_step_runs`, `external_identities`, `entity_relationships` and `activity_logs` using one correlation ID.
11. Deploy `meta-sync` and `gmail-sync`, then exercise them with non-production provider accounts before enabling scheduled sync.
12. Regenerate `src/integrations/supabase/types.ts` from the migrated branch and compare it with the checked-in transitional typings.

Rollback requirement: the migrations are additive. If application rollout must be paused, disable the four seeded workflows and stop the updated Edge Functions; do not drop event or identity data.
