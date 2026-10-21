# crm.lead.update

Implemented on `chore/mastra-install`; deployed only to test project `upqzzkdqlaqzgprufzrf` on 2026-10-21.

The action follows the existing Operating Manager proposal, edit, reject, approve, retry and audit pipeline. Member roles may propose and approve; readonly and partner roles may not. Risk is medium, and the Mastra bridge always requests human approval in DRAFT_APPROVAL and AUTO. OFF submits nothing.

Required input: `lead_id` (UUID). At least one update field is required:

| Field | Value |
|---|---|
| last_touched_at | ISO datetime with explicit timezone, or null |
| next_followup_at | ISO datetime with explicit timezone, or null to clear |
| notes | string (including empty), or null |
| phone | string (including empty), or null |
| status | new, contacted, qualified, unqualified, customer |

Unknown fields are rejected, including company_id, created_by, email and score. Validation runs on proposal, edit and execution.

The target is `customers.id` with both authenticated `company_id` and `record_type='lead'` filters. A UUID from the separate `leads` table is not interchangeable. Existing reply-sync/follow-up workflows remain unchanged until their record identity is reconciled.

Execution reads the changed fields, then conditionally updates only if those fields still equal the read values. Missing, foreign and non-lead records return the same error. A concurrent change causes failure for review. The action result and completed audit detail contain `{ id, before, after }`; the snapshot covers only changed fields. Rollback is manual, not an automatic undo operation. Existing action claiming/idempotency prevents a completed action from being reapplied by duplicate approval.

The mutation, action completion and audit use the existing separate database calls, not a new transaction. Consequently an infrastructure failure between these calls has the existing pipeline's recovery limitations; this change does not claim transactional exactly-once execution.

See `B4_LEAD_UPDATE_VERIFICATION.md` for validation and remaining limitations.
