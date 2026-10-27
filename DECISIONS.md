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

## 6b. Finalized chat API contract (binding for Chat-agent AND UI-agent — do not diverge)

`POST ${VITE_SUPABASE_URL}/functions/v1/lead-generation-chat`
Headers: `Authorization: Bearer <session.access_token>`, `apikey: <VITE_SUPABASE_PUBLISHABLE_KEY>`, `Content-Type: application/json`
(same auth pattern as `src/lib/streamChat.ts` — direct `fetch`, not `supabase.functions.invoke`, so the raw `ReadableStream` body is accessible for manual SSE line-parsing.)

Request body, one of three `mode`s:

1. `{ mode: "chat", messages: ChatMsg[], session_id?: string }` — free-text chat turn. No `session_id` → create a new `lead_gen_sessions` row. Parses intent as the existing "chat-based search mode" code already does, but now persists incrementally into `lead_gen_results` as it streams, instead of only returning results to the client and discarding them.
2. `{ mode: "structured", category, location, maxResults, filters }` — existing form-based path, same persistence change as above.
3. `{ mode: "confirm", session_id: string, confirm: { kind: "radius_expand" | "save_confirm", accept: boolean, result_ids?: string[] } }` — resumes a session that is paused awaiting confirmation (`lead_gen_sessions.awaiting_confirmation_type` is set).

Behavior:
- When a search (`chat` or `structured`) finds fewer than the requested/minimum count, the backend does **not** silently retry broader (removing the old auto-expand behavior). Instead it sets `awaiting_confirmation_type = 'radius_expand'`, stores suggestion data in `awaiting_confirmation_payload`, emits `confirm_needed` SSE event (shape: `ConfirmNeededEvent` with `kind: "radius_expand"` from `leadSource.ts`), and closes the stream.
- At the end of **every** successful search (shortfall or not), after results are scored/enriched, the backend emits a `confirm_needed` event with `kind: "save_confirm"` (count = current result count) and closes the stream. Nothing is ever auto-saved — "intet gemmes uden bekræftelse" applies to every search, not just the shortfall case.
- Client resumes with `mode: "confirm"`:
  - `radius_expand` + `accept: true` → reopens the stream, searches broader (wider queries / neighboring cities from `suggested_cities`), streams more `leads_batch`/`owner_validated`, ends with a fresh `leads_final` + a new `save_confirm` `confirm_needed`.
  - `radius_expand` + `accept: false` → stream goes straight to `leads_final` + `save_confirm` `confirm_needed` with the results already have.
  - `save_confirm` + `accept: true` → server maps the session's `lead_gen_results` (or just `result_ids` if provided, for partial save) into the `leads` table, deduping against existing leads via the new phone/domain/name+city indexes, sets `imported=true` + `imported_lead_id`, emits `saved` event `{ session_id, saved_count, skipped_count, skipped_reasons[] }`, then `done`.
  - `save_confirm` + `accept: false` → clears `awaiting_confirmation_type`, emits `done`, nothing saved.

SSE event type union (extends the existing `sseEvent(type, data)` wire format, one new event per line, `data: {"type": "...", ...}\n\n`):
`status | progress | leads_batch | owner_validated | confirm_needed | leads_final | saved | done | error`

Frontend quick-reply chips map directly to `confirm` calls:
- "Udvid til Xkm" / "Nej, vis hvad du har" → `radius_expand` accept true/false
- "Gem alle N leads i Leads" / "Annuller" → `save_confirm` accept true/false
- "Kun med telefon" / "Kun ejer valideret" → client-side filters on already-streamed `leads_final`, no new request needed.

## 7. Agent team / branching

Using git worktrees under `../worktrees/leadgen-<agent>` off `main`, merged back via PR-style local
merges into a `feature/leadgen-chat` integration branch (not pushed to `main` until QA passes).

## 8. Source-agent addendum — gosom / OSM / SearXNG implementation notes

Built by the Source-agent: `leadgen/docker-compose.yml` (gosom + SearXNG services) and
`supabase/functions/_shared/sources/{gosomSource,osmSource,searxngSource}.ts`, plus a shared
`fetchPolite.ts` helper (User-Agent + robots.txt check + per-domain token-bucket rate limit,
covering mission items #26 and #48 for every adapter at once rather than duplicating it three
times). `leadSource.ts` was **not modified** — `LeadSourceName` already listed `"Gosom"`, `"OSM"`,
`"SearXNG"`, so no shared-type change was needed.

- **gosom is confirmed active**: MIT license, 337+ commits, actively maintained as of this
  writing, with a documented web/job-API mode (`-web` flag, REST API at `/api/v1/jobs`,
  OpenAPI docs at `/api/docs`). No substitution was needed — section 2's choice holds.
- **Inherited risk, not solved here**: gosom scrapes Google Maps, exactly like the existing
  Apify `compass~crawler-google-places` path it's meant to replace as the default. Swapping
  the implementation does not change the underlying Google ToS exposure — this was already true
  before this change and is a product/legal decision outside this agent's scope, not a new risk
  introduced by self-hosting.
- **Not live-tested — be aware before relying on these in production**: this environment has no
  Docker daemon and no Deno runtime, so none of gosom's job-API, Overpass's response shape, DAWA's
  geocoding response, or SearXNG's JSON API were exercised against real network calls. What *was*
  verified: `leadgen/docker-compose.yml` parses as valid YAML with the expected structure
  (checked with PyYAML in an isolated venv, not `docker compose config` — no Docker CLI present);
  all four new/changed `.ts` files typecheck cleanly under `tsc --strict --noEmit` against a
  minimal `Deno` global shim (no real Deno/Supabase type definitions installed either). Before
  trusting these in production, a human/CI step should: (a) `docker compose -f
  leadgen/docker-compose.yml up -d` and hit `gosom`'s `/api/docs` to confirm the actual job-create
  JSON field names match `gosomSource.ts`'s `createJob()` payload (adjust if gosom's schema has
  moved on from what its README documents); (b) confirm Overpass's response for a real DK query
  matches the `tags`/`center` shape assumed in `osmSource.ts`; (c) mount a SearXNG `settings.yml`
  enabling `search.formats: [html, json]` — SearXNG disables its JSON API by default, documented
  inline in `leadgen/docker-compose.yml`, and `findWebsite()` will 403 without it.
- **No `GOSOM_BASE_URL`/`SEARXNG_BASE_URL` env vars are required to be set for self-hosted local
  dev** — both adapters default to `http://localhost:8081` (gosom) and `http://localhost:8082`
  (SearXNG), matching the host ports mapped in `leadgen/docker-compose.yml`. Set the env vars only
  to point at a non-default host (e.g. a shared staging instance instead of localhost).
- **OSM tag mapping is a heuristic, not exhaustive**: `osmSource.ts`'s Danish-term → OSM
  `craft`/`shop`/`office`/`amenity` tag map covers the common trades already in
  `lead-generation-chat/index.ts`'s `CATEGORY_MAP`/`KRAK_CATEGORY_MAP`, falling back to a
  name-text Overpass query for anything unmapped. Expect to extend the map as real queries surface
  gaps — this is a known, intentional v1 limitation, not an oversight.

## 8. Integration checkpoint (ready agents merged)

Merged into `feature/leadgen-chat` (local, not pushed):
- **Chat/persistence agent** → `lead-generation-chat/index.ts` now persists into
  `lead_gen_sessions`/`lead_gen_results` + owner-validation helpers (+330 lines).
- **Source agent** → self-hosted sources `_shared/sources/{gosomSource,osmSource,searxngSource,fetchPolite}.ts`
  + `leadgen/docker-compose.yml` (gosom/SearXNG), Apify kept as opt-in fallback.

Both merged conflict-free. `npm run type-check` → **0 errors** (frontend).
The `a17c9e52` worktree had nothing new; `a46fb731` is stale (behind HEAD) — not merged.

**QA status:** the merged logic is Deno edge-function + Docker-service code — **not verifiable in this
environment** (no Deno CLI, no Docker for gosom/SearXNG, no edge-function deploy access). Frontend
compiles. Remaining before push: deploy + Deno check the functions, run the gosom/SearXNG services,
and an end-to-end chat→search→confirm→save pass against the SSE contract (§6/§6b).

## 9. Live QA of the OSM source (real network, no Docker) — 2 real bugs fixed

Ran `osmSource.search({queries:["tømrer"], location:"Randers"})` against real network via Deno.
Two bugs that would have made the OSM source always return 0 leads:

1. **Dead geocoder.** It geocoded via DAWA (`api.dataforsyningen.dk/adresser`), which now returns
   **HTTP 410 Gone** (decommissioned). → Replaced with OSM **Nominatim** (`/search?q=<loc>, Danmark
   &countrycodes=dk`), live-verified: "Randers" → 56.4618, 10.0371.
2. **robots.txt blocked the APIs.** `politeFetch` applied a robots.txt check to Nominatim `/search`
   and the Overpass `/api/interpreter` — both documented programmatic APIs that blanket-disallow
   crawlers in robots.txt but permit automated use under their own fair-use policies. → Passed
   `skipRobotsCheck: true` for both (self-throttle + identifiable User-Agent still enforced).

After both fixes, the chain runs: Nominatim geocode ✓ → Overpass query (well-formed). **Remaining
blocker is external**: the public Overpass instance returns **502 "at capacity"** for automated use
and explicitly says to self-host for automation — so OSM needs a self-hosted Overpass alongside the
gosom/SearXNG Docker services. gosom + SearXNG themselves remain untested (no Docker daemon here).
`deno check` clean on the edited source.

## 10. Live QA of gosom + SearXNG via Docker (colima) — 3 more real bugs fixed

Installed colima + docker + docker-compose, booted a Linux VM, ran
`docker compose -f leadgen/docker-compose.yml -f <local JSON override> up -d` — both
`leadgen-gosom` (:8081) and `leadgen-searxng` (:8082) came up healthy.

**SearXNG** — `findWebsite("Dagrofa","København")` → `https://dagrofa.dk` live. The compose
file's JSON-format gotcha is real: the API 403s until `search.formats` includes `json`; mounting
a settings.yml override (with a locally-generated secret) fixed it. Verified end-to-end. ✓

**gosom** — the "NOT LIVE-TESTED" adapter had three bugs that made it return 0 leads:
1. **`max_time: "5m"` (string) → HTTP 422.** gosom decodes it as a Go `time.Duration`, which
   `encoding/json` unmarshals from an integer number of NANOSECONDS. Fixed → `5*60*1e9`.
   (string "5m" → 422; `300000000000` → 201, verified live.)
2. **Poll read `status`, gosom returns `Status` (PascalCase).** Its GET /jobs/:id uses PascalCase
   keys even though the create response uses lowercase `id` — so the poll saw "" forever and every
   job "timed out" after 120s despite finishing in ~30s. Fixed → read `Status ?? status`.
3. **CSV parser broke on real data.** `?format=json` is ignored (gosom always returns text/csv),
   and the naive comma-split mis-aligned every row once an address/JSON column contained a comma.
   Replaced with an RFC4180-aware tokenizer (quoted fields may hold commas/newlines/`""`), and
   fixed the rating column name (`review_rating`, not `rating`).

After the fixes: `gosomSource.search(["tømrer"],"Randers")` returns 10 real Randers carpenters with
correct names, comma-bearing addresses, phones, websites and ratings (e.g. "Nordbyens Tømrer og
Snedker — Lavendelvej 8, 8930 Randers — ★5"). The full open-source scraping layer (gosom + SearXNG
+ OSM) is now live-verified. `deno check` clean. Docker services are torn down after the test.
