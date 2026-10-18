# Proposed Action Registry entry: `crm.lead.update` (for owner review — OWNER_DECISIONS #10)

**Status:** PROPOSAL ONLY. Not implemented. This documents the exact entry to add to
`supabase/functions/ai-operating-manager/index.ts` so the CRM agent's reply-sync and
follow-up capabilities can record a touch instead of only proposing a review task.

## Why
Reply-sync (`reply-sync.ts`) and follow-up scheduling need to set a lead's
`last_touched_at` / `next_followup_at` after a verified interaction. The registry has
`crm.lead.create` and `crm.lead.move_stage` but **no** `crm.lead.update`. The agent
must not write the DB directly, so today it can only propose a review task. A proper,
tenant-isolated, audited action closes this gap.

## Proposed definition (mirrors the existing action shape)
```ts
"crm.lead.update": {
  name: "crm.lead.update",
  description: "Opdatér et lead (fx opfølgningsstatus eller noter)",
  requiredRoles: MEMBER_ROLES,
  requiredFields: { lead_id: "uuid" },
  optionalFields: {
    last_touched_at: "timestamp",
    next_followup_at: "timestamp",
    notes: "string",
    status: "string",
    phone: "string",
  },
  risk: "medium",
  connector: "internal",
  rollback: "Ændringerne fremgår af handlingsloggen (ai_action_audit).",
}
```

## Constraints the executor must enforce (same as existing actions)
- `requireCompanyAuth` → the lead must belong to the caller's `company_id` (RLS + explicit check); never cross-tenant.
- Whitelist updatable columns to the optional fields above — never allow arbitrary column writes (no `company_id`, `email`, `created_by`, `score` tampering via this action; email changes should stay a deliberate, separate flow).
- Idempotency via the existing `idempotency_key` path; audit before/after into `ai_action_audit`.
- Default automation: `DRAFT_APPROVAL`. `AUTO` only for low-risk; this is `medium`, so it stays human-approved unless the owner opts a tenant into AUTO for it.

## Agent changes once added (small, already designed)
- `reply-sync.ts`: in addition to the review task, propose `crm.lead.update { lead_id, last_touched_at: <reply time> }`.
- `followup-sequence.ts`: on a completed step, propose `crm.lead.update { next_followup_at }`.
- Add the action name + `medium` risk to `ACTION_RISK` in `action-proposal.ts`, with a unit test.

No code changed yet — awaiting the owner decision (#10).
