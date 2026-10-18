# Marketing Agents — Status

**Owner:** Marketing loop (MASTERPROMPT 3) · **Worktree:** `/Users/macbookpro/marketing-agents-worktree` · **Branch:** `feature/marketing-agents` (based on `feature/frontend-operating-system` @ `eeaa028`)
**Depends on:** the Mastra platform (`chore/mastra-install`) and the propose-only Action Registry bridge (commit `316e867`). Marketing agents are specialist agents on that platform — not a new chatbot. All external writes go through `ai-operating-manager`.
**Last updated:** 2026-10-18 (iteration 3 — Meta Ads read-only analysis + budget-suggestion drafts)

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

## Marketing capability coverage so far (all propose-only, tested)
channel-adapted post drafter · Meta Ads analysis + budget-suggestion drafts. Real metric tables confirmed: `meta_campaigns` (daily_budget/objective/status), `meta_daily_insights` (spend/clicks/impressions/conversions/cpc/cpm/ctr/reach), `meta_leadgen_events`, `meta_ad_sets`, `meta_creatives`.

## Next action (iteration 4)
**results→leads→CRM feedback**: from (mocked) `meta_leadgen_events`, attribute ad-sourced leads back to campaigns and summarize cost-per-lead per campaign (read-only, grounded in real rows). Hand off to CRM as a `crm.lead.create` DRAFT only for net-new, lawfully-sourced leads (dedupe, record source) — no fabricated contacts. Unit tests + typecheck.
Deferred until a schema decision (OWNER_DECISIONS #7): company-knowledge persistence (versioned, sourced), website change-detection, and the 30-day content calendar.

## This iteration — evidence
Integration mapping only, read-only. No code, no DB, no external calls, nothing published. Worktree `feature/marketing-agents` created off `eeaa028`; this file is the only change. `localhost:8080` untouched (other agent's).
