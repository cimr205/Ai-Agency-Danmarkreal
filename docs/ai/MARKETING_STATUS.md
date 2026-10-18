# Marketing Agents — Status

**Owner:** Marketing loop (MASTERPROMPT 3) · **Worktree:** `/Users/macbookpro/marketing-agents-worktree` · **Branch:** `feature/marketing-agents` (based on `feature/frontend-operating-system` @ `eeaa028`)
**Depends on:** the Mastra platform (`chore/mastra-install`) and the propose-only Action Registry bridge (commit `316e867`). Marketing agents are specialist agents on that platform — not a new chatbot. All external writes go through `ai-operating-manager`.
**Last updated:** 2026-10-19 (iteration 6 — 30-day content-calendar generator + schema proposal)

## Hard rules
- Map REAL integrations only. Mark missing ones BLOCKED; never build fictional connectors or fake metrics/publishing.
- All external writes via the shared Action Registry. OFF / DRAFT_APPROVAL / AUTO per channel+action.
- No push, no deploy. No real external publishing in tests (mocks/sandbox only).
- Don't re-scvrape the whole site each action; detect changes and re-validate uncertain facts.

## Integration map (verified read-only from `supabase/functions/` + Supabase types, 2026-10-18)

### REAL — present and usable
| Capability | Backing | Notes |
|---|---|---|
| **Meta Ads** (Facebook/Instagram **ads**) | `meta-oauth-start/callback`, `meta-sync`, `meta-ads-ai`, `meta-publish-campaign`, `meta-disconnect` | OAuth + sync + AI + publish exist. Publishing a campaign **spends budget** → always `approve`. |
| **Lead capture → CRM** | `meta-leadgen-webhook` | Meta lead ads flow into `leads`. Enables results→leads→CRM feedback. |
| **Text generation** (posts, scripts, image briefs, email) | `ai-generate`, `ai-email-writer`, `smart-assistant`, `workflow-assistant` | Via the AI gateway (`LOCAL_LLM_*` / OpenRouter). **Live gen BLOCKED locally** until model creds exist (same as platform live-inference blocker). |
| **Image generation** (ad creative / visuals) | `ai-generate` (`meta/muse-image`, OpenRouter Unified Image API) | Real generator, **~$0.01/image** → owner budget decision before AUTO. Needs gateway creds. |
| **Company public data** | `cvr-search` (DK CVR), `companies-house-search` (UK), `registry-ai-analyze` | Lawful public registries for competitor/company facts in selected countries. |
| **Meta Ads analysis + budget** | `meta-sync` + `meta-ads-ai` | Analysis is read-only; budget changes = proposals (`approve`). |

### BLOCKED — no real connector (do NOT fabricate)
| Channel/feature | Status | Why |
|---|---|---|
| **LinkedIn** (publish/analyze) | BLOCKED | No `linkedin-*` function or connector. |
| **TikTok / Shorts** | BLOCKED | No `tiktok-*` function or connector. |
| **Instagram / Facebook ORGANIC posting** (non-ads) | BLOCKED (needs verification) | Only Ads publishing is evident (`meta-publish-campaign`); no organic post publisher found. |
| **`composio-integration` / `mcp-server`** as social publishers | BLOCKED (unconfirmed) | Functions exist but no evidence they expose LinkedIn/TikTok/IG publishing; must be verified before any use. |

### NOT PRESENT — net-new data models required (needs owner/schema decision)
No tables in `src/integrations/supabase/types.ts` for any of:
- **Company knowledge base** (versioned, with source + date + manual correction)
- **Website snapshot / change detection**
- **30-day content calendar / monthly strategy / content plan**
- **Brand voice / audiences / services / pricing onboarding store**

These are the foundation for most marketing features and do not exist yet. Building them means a **new Supabase migration** — must not collide with the other agent's schema work. Logged as OWNER_DECISIONS #7.

## Automation mapping (rides on the Action Registry)
- Marketing external actions reuse `marketing.campaign.create` (medium; draft only) and `email.send`. Publishing a paid campaign spends budget → **approve** regardless of mode.
- OFF: agent proposes nothing. DRAFT_APPROVAL (default): propose → human approves. AUTO: only low-risk, policy-gated, never for paid publish.

## Done
- **Iteration 2** — channel-adapted post drafter (platform commit `23f6f3f`): `src/mastra/agents/marketing/post-drafter.ts` + test (**5/5 passing**, typecheck clean). Deterministically shapes a channel draft from supplied company-knowledge facts (length cap + hashtag count per channel), flags publish-unsupported channels (LinkedIn/TikTok/IG/Shorts) so nothing is auto-published, and proposes `marketing.campaign.create` DRAFTs via the propose-only bridge. **Not** live AI generation (gateway creds BLOCKED, #1/#8); no fabricated metrics; no publish.

- **Iteration 3** — Meta Ads read-only analysis + budget-suggestion drafts (platform commit `f67b865`): `src/mastra/agents/marketing/meta-ads-analysis.ts` + test (**4/4 passing**, typecheck clean). Aggregates real `meta_daily_insights` (spend/clicks/impressions/conversions) per campaign, derives CTR/CPC/CPA (CPA null when no conversions — never faked), and makes deterministic increase/decrease/pause/hold suggestions surfaced as `tasks.create` review DRAFTs. **Never changes spend**; paid budget changes stay a separate human-approved step.

- **Iteration 4** — results→leads→CRM feedback (platform commit `fa22c05`): `src/mastra/agents/marketing/results-feedback.ts` + test (**4/4 passing**, typecheck clean). Attributes real `meta_leadgen_events` to campaigns, computes cost-per-lead (null when spend unknown — never faked), parses contact fields defensively from the event `raw` (Meta field_data, never fabricated), and proposes `crm.lead.create` DRAFTs for net-new emailed, unlinked leads (dedupe by email incl. in-batch; already-linked skipped), recording the campaign as source.

- **Iteration 5** — competitor price analysis (platform commit `b7d4d6f`): `src/mastra/agents/marketing/competitor-analysis.ts` + test (**3/3 passing**, typecheck clean). Compares own offerings vs competitor data points that each carry an explicit source + date (verifiable; no invented figures, no live scraping). Same-currency only (different currency flagged, never silently converted), VAT/incl-VAT noted, median + price position. Flags gaps as `tasks.create` review DRAFTs — price changes stay proposals, never applied.

## Marketing capability coverage so far (all propose-only, tested, 16 unit tests)
channel-adapted post drafter · Meta Ads analysis + budget-suggestion drafts · results→leads→CRM feedback · competitor price analysis.

## Blocked / deferred (needs owner decisions, NOT fabricated)
- **Company-knowledge base** (versioned, sourced, with manual correction), **website analysis + change detection**, **30-day content calendar + monthly strategy** — no tables exist; need a migration (OWNER_DECISIONS #7). These are the remaining HOVEDMÅL items and depend on that schema decision.
- **Live text/image generation** (ai-generate / meta/muse-image) — needs AI-gateway creds + budget (#1/#8). Current drafters are deterministic.
- **LinkedIn/TikTok/Shorts/organic posting** — no connector (#9); draft-only.
- **Live competitor sources** — needs authorized sources per market (#5/FO-5); module runs on supplied, source-tagged inputs.

- **Iteration 6** — 30-day content-calendar generator + schema proposal (platform commit `1ca46b7`): `src/mastra/agents/marketing/content-calendar.ts` + test (**3/3 passing**, typecheck clean). Deterministically lays out a dated content plan from company-knowledge facts + channel rotation/cadence (reuses the drafter), proposes `marketing.campaign.create` DRAFTs with `scheduled_date` and unique keys — never publishes, no live gen, no fabricated metrics. Persistence/editing deferred to the schema. Wrote `MARKETING_SCHEMA_PROPOSAL.md` (this branch): `company_knowledge` (versioned/sourced/correctable), `website_snapshots` (change detection), `content_calendar` (editable 30-day plan) + 2 new registry actions — for owner review (#7), no migration applied.

## Marketing capability coverage so far (all propose-only, tested, 19 unit tests)
channel-adapted post drafter · Meta Ads analysis + budget-suggestion drafts · results→leads→CRM feedback · competitor price analysis · 30-day content-calendar generator.

## Status
Marketing HOVEDMÅL are covered at the propose-only / generation layer for everything buildable without new schema or live creds. The remaining items are owner-gated and documented, not faked:
- **Persistence** (company knowledge, website snapshots/change-detection, content calendar) → needs the migration in `MARKETING_SCHEMA_PROPOSAL.md` (#7).
- **Live text/image generation** → AI-gateway creds + budget (#1/#8).
- **LinkedIn/TikTok/Shorts/organic publishing** → no connector (#9); draft-only.
- **Live competitor/trend sources** → authorized sources per market (#5/FO-5).

## Next action (iteration 7)
**BLOCKED pending owner input** (#7 schema, #1/#8 creds, #9 connectors, #5 sources). No further propose-only surface adds value without one of these. The track holds; if a blocker is lifted, resume with that specific work (e.g. wire persistence once the migration is approved). No low-value churn.

## This iteration — evidence
Integration mapping only, read-only. No code, no DB, no external calls, nothing published. Worktree `feature/marketing-agents` created off `eeaa028`; this file is the only change. `localhost:8080` untouched (other agent's).
