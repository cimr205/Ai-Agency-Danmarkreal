# Marketing persistence — schema proposal (for owner review — OWNER_DECISIONS #7)

**Status:** PROPOSAL ONLY. No migration applied. Documents the tables the marketing
HOVEDMÅL need (company knowledge, website analysis + change detection, content
calendar) so the owner can approve a migration. Must be tenant-isolated (RLS on
`company_id`) exactly like existing tables. All AI writes still go through the Action
Registry; these tables are the storage the proposals target once approved.

## 1. `company_knowledge` — versioned, sourced facts (with manual correction)
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| company_id | uuid | tenant; RLS |
| field | text | e.g. "value_proposition", "services", "brand_tone", "pricing", "audiences", "countries", "social_profiles" |
| value | jsonb | the fact |
| source | text | URL / document the value came from (verifiable) |
| source_date | date | when observed |
| version | int | incremented per field on change |
| confidence | text | "verified" / "unverified" |
| corrected_by | uuid null | set when a human manually corrects |
| superseded_at | timestamptz null | non-null = historical version |
| created_at / updated_at | timestamptz | |

Rule: never overwrite in place — insert a new version; keep history. Uncertain facts
(`confidence = unverified`) are re-validated before use.

## 2. `website_snapshots` — source-based analysis + change detection
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| company_id | uuid | RLS |
| url | text | approved URL only |
| fetched_at | timestamptz | |
| content_hash | text | hash of normalized content for change detection |
| extracted | jsonb | structured facts extracted this fetch |
| changed_from_previous | boolean | set by comparing content_hash |

Rule: do not re-scrape the whole site each action — fetch on a schedule, compare
`content_hash`, and only re-extract when it changed. Changes feed `company_knowledge`
as new versions (with source + date).

## 3. `content_calendar` — 30-day plan + monthly strategy (editable)
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| company_id | uuid | RLS |
| scheduled_date | date | |
| channel | text | facebook/instagram/linkedin/tiktok/shorts |
| status | text | draft / approved / scheduled / published / skipped |
| body | text | the draft copy |
| hashtags | text[] | |
| asset_ref | uuid null | optional generated image (ai-generate) |
| source_knowledge_version | int null | which knowledge version the draft was built from |
| order_index | int | for drag-and-drop reorder |
| created_by | uuid | (agent or user) |

Rule: publishing stays a separate, authorized step (and only for channels with a real
connector — today Meta only; LinkedIn/TikTok/Shorts stay draft-only, #9).

## What this unlocks (already designed, built against mocks today)
- `content-calendar.ts` (commit `1ca46b7`) already generates the 30-day plan and
  proposes `marketing.campaign.create` drafts — it just can't persist/edit without
  `content_calendar`.
- Website analysis + change detection and versioned knowledge drive grounded,
  non-hallucinated post copy and competitor/trend context.

## Required new Action Registry entries (medium risk, member/manager, audited)
- `marketing.calendar.upsert` (manage calendar entries; publish stays separate/approve)
- `marketing.knowledge.correct` (manual correction of a knowledge field → new version)

No code or migration applied — awaiting owner approval (#7). Coordinate the migration
with the other agent to avoid clobbering their schema work.
