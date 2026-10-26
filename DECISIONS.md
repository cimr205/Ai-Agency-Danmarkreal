# DECISIONS.md — Lead-Generation AI Chat

Autonomous engineering log for the "find 100 tømrere i Randers" chat lead-gen feature.
Written as decisions are made so work can be audited/resumed. Danish kept where it mirrors user-facing copy.

## 0. Repo reality check (overrides CLAUDE.md where they conflict)

`CLAUDE.md` describes a Railway REST API (`src/lib/api.ts`) as the primary backend. That is stale.
The actual, currently-shipping backend for CRM/leads is **Supabase**: Postgres + Auth + RLS +
~60 Deno edge functions in `supabase/functions/*`, called via `supabase.functions.invoke()` /
`supabase.rpc()`. All new work follows the Supabase pattern, not the documented-but-dead Railway one.

## 1. Two pre-existing lead-gen pipelines found — reconciling, not rebuilding

- `supabase/functions/lead-gen-api/` (1504 lines): session-based (`lead_gen_sessions` /
  `lead_gen_results` tables), what `src/hooks/api/useLeadGen.ts` + `LeadGenerationPage.tsx`
  actually use today. No chat, no SSE.
- `supabase/functions/lead-generation-chat/` (1429 lines): SSE streaming, Google Maps (via Apify)
  + Krak (via Apify) + website crawl + live cvrapi.dk CVR enrichment + AI qualification + dedupe/merge/scoring.
  Not wired to any frontend route — a half-built version of exactly what's being asked for, abandoned mid-flight.

**Decision**: extend `lead-generation-chat` to be the chat backend, but make it **persist into the
same `lead_gen_sessions`/`lead_gen_results` tables** `lead-gen-api` already uses, so results are
compatible with the existing Leads-import path and UI. Do not fork a third pipeline.

## 2. Scraping sources — open source first, per mission brief

`lead-generation-chat` currently calls **Apify** (`compass~crawler-google-places`,
`ecomscrape~krak-business-search-scraper`) — a paid third-party service, against the mission's
"open source and free first, paid only as an opt-in fallback behind env vars" rule.

**Decision**:
- Add `gosom/google-maps-scraper` (MIT) as a self-hosted Docker service — primary Maps source.
- Add OSM/Overpass as a free supplementary source (catches businesses Maps/CVR miss, esp. phone-less listings).
- Add SearXNG (self-hosted) to resolve official websites/contact pages without a paid search API.
- Keep the existing Apify calls, but gate them behind `APIFY_API_TOKEN` presence as an **optional
  fallback** when self-hosted sources return too little (mirrors the "Places API optional fallback" instruction).
- No `docker-compose.yml` exists anywhere in this repo (confirmed via full-tree search) — the
  convention for side-services (`lead-engine/`, `scraper/`) is ad-hoc `start.sh` scripts with no
  orchestration. Introducing one `docker-compose.yml` scoped to `leadgen/` is justified here because
  the mission explicitly requires running gosom/SearXNG as services, and no existing convention covers it.

## 3. CVR data

No local CVR bulk dump found anywhere on this machine (repo, `~/Downloads`, `~/Desktop`,
`~/Documents` all checked) and no `CVR_DATA_PATH` set. Live lookups already work today via
`cvrapi.dk` (free, rate-limited, used by `cvr-search` edge fn + `lead-generation-chat`'s
`enrichWithCVR`), cached in the `cvr_companies` table.

**Decision**: build the streaming bulk importer (per mission instructions — "build it even if data
isn't there yet") so it activates the moment `CVR_DATA_PATH` is set, but the live `cvrapi.dk` path
stays primary/default. This is **not** a hard blocker — flagged as a user to-do (bulk CVR access is
an application process: https://datacvr.virk.dk / Erhvervsstyrelsen system-til-system adgang).

## 4. Owner validation — what's actually achievable without elevated CVR access

cvrapi.dk's free tier returns company basics, not reelle ejere/ledelse (that needs Erhvervsstyrelsen's
gated CVR API, which requires an application — see to-do list). Without it we cannot claim real
"ejer-validering" from CVR directly.

**Decision**: implement owner validation as a confidence-scored, multi-source heuristic, never a
guess:
- Enkeltmandsvirksomhed heuristic: if `virksomhedsform` indicates sole proprietorship, the registered
  name often *is* the owner's name — flag as medium confidence, source `CVR:virksomhedsform`.
- Website crawl of `/kontakt`, `/om-os`, `/about` extracting named individuals + role keywords
  (indehaver/ejer/direktør/CEO/founder).
- Cross-check: if the same person name appears on both the website and matches patterns in the CVR
  company name, bump confidence to "high". If only one source, "medium". If none, show **"ikke
  valideret"** — never fabricate a name.
- LinkedIn is never scraped — only a generated search-link (`linkedin.com/search/results/people/?keywords=...`)
  per the semi-automatic outreach flow already modeled in `linkedin_outreach`.
- Real CVR ledelse/ejere data becomes a drop-in upgrade once system-to-system access is granted — noted as a to-do, interface is built to accept it (`ejer_kilder[]` already supports an additional source type).

## 5. Data model changes (additive migration, no destructive changes)

Add to `lead_gen_results` (migration `supabase/migrations/<ts>_leadgen_owner_compliance.sql`):
- `owner_name text`, `owner_role text`, `owner_confidence integer default 0`, `owner_sources text[] default '{}'`
- `reklamebeskyttet boolean` (nullable — **null means unknown, never treated as "safe to contact"**)
- `samtykke_status text default 'ukendt'` (`ukendt|givet|nej`)
- `cvr_status text` (aktiv/ophørt/tvangsopløst — distinct from the free-text `active_status` already present)
- Unique-ish dedupe index on `(company_id, lower(company_name), city)` and separate index on normalized phone, to support permanent cross-session dedupe (mission item #24), not just per-session merge.

`lead_gen_sessions` gets `radius_km integer`, `awaiting_confirmation_type text` (`radius_expand|save_confirm|null`)
to drive the chat's "ask before expanding / ask before saving" states statelessly across SSE reconnects.

Existing mock/seed lead data: **none found** (confirmed — no static JSON/seed fixtures for leads).
Phase 8 "remove fictional data behind a flag" therefore has nothing to remove; documented here so
it isn't re-investigated.

## 6. SSE event contract (extends the existing `sseEvent()` helper, same wire format)

Event types in flight already: `status`, `progress`, `leads_batch`, `leads_final`, `done`.
New event types added, same `data: {type, ...}\n\n` shape:
- `confirm_needed` — `{ kind: "radius_expand", current_count, requested, suggested_radius_km, suggested_cities[] }`
  or `{ kind: "save_confirm", session_id, count, saved_preview_fields }`. Stream pauses (keeps connection
  open, heartbeats every 15s) until the client POSTs a confirmation to the same session.
- `owner_validated` — per-lead incremental event: `{ result_id, owner_name, owner_role, owner_confidence, owner_sources[] }`
- `saved` — `{ session_id, saved_count, skipped_count, skipped_reasons[] }` after commit.

No cold-mail sending exists or will exist anywhere in this feature (markedsføringsloven §10) — confirmed as a hard constraint, not a suggestion.

## 7. Agent team / branching

Using git worktrees under `../worktrees/leadgen-<agent>` off `main`, merged back via PR-style local
merges into a `feature/leadgen-chat` integration branch (not pushed to `main` until QA passes).
