# Backend integration contract — Epic 1 (atomic CRM & dedup)

For the frontend/UX branch to wire against. Everything here is live on `claude/backend-production`
and verified against the real database (see `docs/claude-backend-plan.md` for what was checked).

## `convert_lead_to_deal` (RPC)

```ts
const { data, error } = await supabase.rpc('convert_lead_to_deal', {
  p_lead_id: string,               // customers.id where record_type = 'lead'
  p_deal_name: string,
  p_pipeline_stage_id?: string | null,  // accepted, currently unused — see note below
  p_value?: number | null,
  p_currency?: string,             // default 'DKK'
});
// data: [{ lead_id, customer_id, deal_id, dedupe_result }]
// dedupe_result: 'created' | 'matched_existing' | 'already_converted'
```

- **Idempotent.** Calling it twice for the same `p_lead_id` returns the same `customer_id`/
  `deal_id` both times (`dedupe_result: 'already_converted'` on the repeat) — safe to call from
  a button `onClick` without a client-side "already submitting" guard, though keeping one for UX
  (disable the button while pending) is still good practice.
- **`p_pipeline_stage_id` note**: `deals.stage` is a free `text` column in this schema — there is
  no `pipeline_stages` table to look up. The RPC accepts this param for signature compatibility
  with the original spec but currently ignores it and always sets `stage = 'discovery'` (matching
  the value both old client flows used). If per-stage selection is wanted, that's a frontend
  decision (pass `p_deal_name` construction aside, the stage would need to become a real text
  param, e.g. `p_stage: string`) — flag before Codex builds UI around `p_pipeline_stage_id`
  actually doing something, since right now it's a no-op.
- Throws `P0002` ("Lead not found for this company") for a nonexistent id or one belonging to
  another tenant — indistinguishable on purpose (no existence leak).
- Already wired into `useConvertLeadToDeal()` (`src/hooks/api/useLeads.ts`), used by
  `LeadDetailPanel.tsx` and `LeadsPage.tsx`. No further backend work needed to use it elsewhere
  in the app — just call the hook.

## `find_contact_duplicates` (RPC, read-only)

```ts
const { data, error } = await supabase.rpc('find_contact_duplicates', {
  p_email: string | null,
  p_phone: string | null,
  p_workspace_id: string,   // must equal the caller's own company_id or the call is rejected (403)
});
// data: [{ match_type, confidence, customer_id, record_type, name, email, phone }]
// match_type: 'email' | 'phone' | 'both'
// confidence: 'high' | 'medium'
```

Not yet called from anywhere in the frontend. Suggested use: a "possible duplicate" inline
warning on the lead/customer create form, called on blur of the email/phone field, before
submit — matches the "dedupe-preview before import and conversion" requirement. No UI built for
this in this pass (out of scope for the backend branch) — the RPC is ready to wire up.

## New `customers` columns (types already regenerated in `src/integrations/supabase/types.ts`)

| Column | Type | Notes |
|---|---|---|
| `normalized_email` | `string \| null` | **Generated column** — read-only, don't try to `.insert()`/`.update()` it directly (Supabase types already exclude it from Insert/Update). Always `lower(trim(email))`, or `null` for empty email. |
| `normalized_phone` | `string \| null` | Trigger-maintained. E.164-shaped when it recognizes the input (Danish 8-digit local numbers get `+45`); `null` when it can't confidently parse — never a guess. |
| `conversion_status` | `'none' \| 'converted'` | On `customers` where `record_type = 'lead'`. |
| `converted_deal_id` | `string \| null` | Set once, on conversion. |
| `converted_at` | `string \| null` (timestamptz) | Set once, on conversion. |
| `source_id` | `string \| null` | Plain uuid, **no FK target** — lead-gen sessions aren't a referenceable table in this schema yet. Carried through from the lead row on conversion if already set; nothing currently sets it on lead creation either. Flag if this needs a real source-of-truth table — out of scope for this pass. |
| `campaign_id` | `string \| null` | Same situation as `source_id`. |

## Server-side leads listing — designed, not built this pass

Requested contract (page/page_size/search/sort/status/owner/source/campaign/folder/saved-view).
This needs its own RPC (`list_leads`) rather than raw PostgREST filters from the frontend, so
sort fields can be whitelisted server-side and the query stays index-friendly. Proposed
signature, ready to implement in a follow-up:

```sql
create or replace function public.list_leads(
  p_page int default 0,
  p_page_size int default 100,
  p_search text default null,
  p_sort_field text default 'created_at',  -- whitelisted: created_at | name | value | score | last_touched_at
  p_sort_direction text default 'desc',    -- whitelisted: asc | desc
  p_status text default null,
  p_owner_id uuid default null,
  p_source_id uuid default null,
  p_campaign_id uuid default null,
  p_folder_id uuid default null
) returns table (
  -- customers.* where record_type = 'lead', plus total_count for pagination
)
```

`company_id` is resolved server-side from `auth.uid()` (same `get_user_company_id()` pattern as
`convert_lead_to_deal`) — never accepted as a parameter, so it can't be forged. Saved-view
filters (the existing `saved_lead_filters` table) aren't referenced by this signature yet;
they'd need their own param or a separate "apply saved view" resolution step before calling this
— worth a short design conversation before building, since saved views currently store filter
state client-side (`src/hooks/api/useLeads.ts` `useSavedLeadFilters`) and this would change where
that filtering actually executes.

## Data cleanup performed while adding the uniqueness constraint

Applying the `(company_id, normalized_email)` unique index where `record_type = 'customer'`
failed on first attempt — one real duplicate pair existed in production
(`qa-test-lead@example.com`, both confirmed as this session's own QA test data by name/content,
not real customer data). One of the two had a deal and two invoices attached from earlier live
testing; those were re-pointed to the surviving customer row before the duplicate was deleted, so
no child records were orphaned. No other duplicates existed. Documented here rather than left
silent, per the "preserve existing data" rule — this was a merge, not a blind delete, and the
full row contents were inspected before acting.
