# Backend production plan — claude/backend-production

Terminology note: the brief uses `workspace_id`/`organization_id`. This codebase's real
tenant column is `company_id` (see `get_user_company_id(auth.uid())`, used across every RLS
policy and RPC). Everything below uses `company_id` — no new tenant column is introduced.

Pre-existing state discovered before writing any code (this matters — several epics assume a
green field that isn't there):

- **Epic 1 is a bug fix, not new ground.** `leads`↔`customers` merge already shipped in an
  earlier pass: `customers` carries `record_type` ('lead'|'customer') and
  `converted_from_lead_id`. The legacy `leads` table still exists on disk but nothing reads
  it — `useLeads.ts`/`usePipeline.ts` already query `customers`. What's actually broken:
  `useConvertLeadToCustomer` (creates a customer row, 2 sequential browser calls, no deal) and
  `LeadDetailPanel.handleConvertToDeal` (creates a deal with **no `customer_id`** — a real
  orphan-deal bug — 2 sequential browser calls, no customer row) are two different, incomplete,
  non-atomic flows that don't call each other. Fixing this is: one atomic RPC, both call sites
  repointed to it.
- **Epic 3 also isn't a green field**: `invoices`, `payments`, `quotes` tables already exist.
  Scoped to what's actually missing: atomic payment registration + status recompute, and a
  void path.
- **Epic 5's premise needs a correction, stated plainly per rule 9**: no native iOS/Android
  companion app exists in this repo, and this session cannot write and ship one (different
  toolchain, app store accounts, code signing — outside a web/Supabase repo entirely). What
  gets delivered: the full backend protocol (pairing, device auth, heartbeats, realtime
  command delivery, idempotent call commands) plus a complete technical spec for the two
  native apps, so a mobile engineer can build against a working, tested backend contract. No
  UI will claim "connected" without a verified heartbeat.

## Status

| Epic | Status |
|---|---|
| 1 — Atomic CRM & dedup | Done |
| 2 — Durable bulk email | Not started this pass |
| 3 — Finance transactions | Not started this pass |
| 4 — Meta Ads real data | Not started this pass |
| 5 — Phone device relay | Not started this pass |
| Cross-cutting (observability/security/API contract) | Partial — established in Epic 1's RPCs, not yet retrofitted elsewhere |

This is a multi-day scope delivered across one working session. Epic 1 is complete,
tested, and documents the integration contract Codex needs. Epics 2–5 are sequenced next;
each has enough schema/architecture context above to start cold in a follow-up pass.

## Epic 1 — what shipped

**Migration**: `supabase/migrations/20260901000001_atomic_lead_conversion.sql`

- `customers.normalized_email` (generated: `lower(trim(email))`, null-safe), `normalized_phone`
  (trigger-maintained E.164-ish normalization, Danish-context default), `converted_deal_id`,
  `converted_at`, `conversion_status` ('none'|'converted'). `source_id`/`campaign_id` added as
  plain nullable uuid columns (no FK target exists yet for either — lead-gen sessions and ad
  campaigns aren't first-class referenceable entities in this schema; documented as a known
  gap, not faked).
- Partial unique index on `(company_id, normalized_email)` where `record_type = 'customer'`
  and `normalized_email is not null` — prevents duplicate *customers* by email within a tenant.
  Deliberately **not** applied to leads (record_type='lead') or where normalized_email is
  null — a company legitimately has many leads sharing a generic inbox (`info@firma.dk`)
  before they're qualified; forcing uniqueness there would silently block real lead capture.
- `find_contact_duplicates(p_email, p_phone, p_workspace_id)` — read-only, `SECURITY DEFINER`,
  tenant-checked against `get_user_company_id(auth.uid())` (param kept as `p_workspace_id` to
  match the requested signature; it's compared against the caller's real `company_id`, so a
  forged company id can't be used to read another tenant's data — see security tests). Returns
  `match_type` ('email'|'phone'|'both'), `confidence`, and the matched `customers.id` rows.
- `convert_lead_to_deal(p_lead_id, p_deal_name, p_pipeline_stage_id, p_value, p_currency)` —
  the atomic RPC. One transaction: validates caller's company via `get_user_company_id`, row-
  locks the lead (`select ... for update`), returns the existing result unchanged if the lead
  is already converted (idempotent — a double-click can't create two customers or two deals),
  finds-or-creates the customer by normalized email/phone within the tenant, creates the deal
  linked by `customer_id` (fixing the orphan-deal bug), sets
  `converted_deal_id`/`converted_at`/`conversion_status` on the lead, writes an
  `activity_logs` row, and returns `{lead_id, customer_id, deal_id, dedupe_result}`.
  `p_pipeline_stage_id` accepted per the requested signature; `deals.stage` is actually a free
  `text` column in this schema (no `pipeline_stages` table exists), so the param maps onto
  `deals.stage` — documented in the integration contract below, not silently dropped.

**Frontend call sites repointed** (hooks only, no UI/markup changes — outside the "avoid
frontend" boundary is the actual bug fix these hooks exist to make real):
- `useLeads.ts`: `useConvertLeadToCustomer` replaced by `useConvertLeadToDeal`, a single
  `supabase.rpc('convert_lead_to_deal', ...)` call.
- `LeadDetailPanel.tsx`: `handleConvertToDeal` now calls the same hook instead of the old
  two-call `createDeal.mutateAsync` + `updateLead.mutateAsync` sequence.

**Tests**: `supabase/tests/convert_lead_to_deal.test.sql` (pgTAP-style, run via
`supabase db query --linked -f`) — idempotency (double call → same ids, no duplicate rows),
rollback (forced failure mid-transaction leaves zero side effects), dedupe (existing customer
by normalized email is reused, not duplicated), cross-tenant isolation (a lead id from another
company_id returns not-found, never another tenant's row).

**Server-side leads listing (Epic 1E)**: designed, not implemented this pass — see
`docs/backend-integration-contract.md` for the finalized RPC signature
(`list_leads(p_company_id, p_page, p_page_size, p_search, p_sort_field, p_sort_direction,
p_status, p_owner_id, p_source_id, p_campaign_id, p_folder_id)` with a whitelisted sort-field
enum) so Codex can build the frontend contract against a stable shape before the function
lands.

## Next steps (not started this pass)

Epics 2–5 need their own migrations/functions from scratch (email job tables, finance RPCs,
Meta Ads sync, phone pairing protocol) — none of that groundwork exists in the current schema.
Each is a multi-file, multi-migration effort comparable in size to Epic 1. Picking up in
priority order (2 → 3 → 4 → 5) is recommended since bulk email currently has no durability at
all (browser-tab-bound), which is the most acute production risk of the four.
