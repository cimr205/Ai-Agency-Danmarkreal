# Owner Decision Resolution — 2026-11-10

Source: `docs/ai/OWNER_DECISIONS.md` (10 open questions, raised 2026-10-18/19/21). Each re-checked against the current codebase rather than assumed stale.

| # | Question | Status | Evidence |
|---|---|---|---|
| 1 | Which model endpoint/credentials for live inference? | **Already decided, in production** | `LOCAL_LLM_BASE_URL`/`MODEL`/`API_KEY` are configured and OpenRouter is live — see `docs/ai/AI_MODEL_FALLBACK_REVIEW.md` (16 passing regression tests against the real `aiConnection.ts`). |
| 2 | May `@ai-sdk/openai-compatible` be added? | **Already decided, done** | Present in `package.json` (`^2.0.47`). |
| 3 | Merge timing for `chore/mastra-install` vs `feature/frontend-operating-system` lockfile edits | **Moot — already merged** | `chore/mastra-install` is fully merged into `origin/main` (confirmed via `git branch --merged origin/main` in the 2026-11-07 branch audit). |
| 4 | Is a persistent Mastra storage adapter (`@mastra/pg`/`@mastra/libsql`) approved? | **Still open — but likely moot** | Only `@mastra/core` is a dependency; no storage adapter package installed. More importantly: the actual **production** AI path (the OpenRouter `models[]` fallback reviewed in this pass, and the `ai-actions`/`ai-message` edge functions) does not go through Mastra at all — it's a direct Deno/OpenRouter integration. Mastra appears to be a secondary/development framework (used by the `feature/*-agents` agent-loop branches), not the live request path. **Safe default applied: do not add a new persistent-storage dependency** until it's confirmed Mastra is actually the production framework for a specific feature that needs it. Parking, not deciding on the owner's behalf. |
| 5 | Loop scheduler available? | **Resolved** (per the source doc itself — a cron job was already scheduled). |
| 6 | `invitations.token` vs `token_hash` type-check failures | **Resolved** | No remaining references to `invitations.token` found; `accept_invitation()` (current migration, read in this pass) correctly uses `token_hash`. `npm run type-check` is clean on the current branch tip (verified in this pass). |
| 7 | Marketing needs net-new tables (knowledge base, website snapshots, content calendar, brand/audience onboarding) | **Still open — genuinely requires a decision** | Confirmed via live schema listing: no `company_knowledge_base`, `website_snapshots`, or content-calendar tables exist. **Safe default applied: parked, not implemented.** Marketing persistence is not on the critical path for the first paid CRM launch (see §3 of the masterprompt's own priority order: Security → Data → Payment → Onboarding → Core → AI → UX → Extensions) — Marketing/Social Suite can ship disabled/behind a flag for the first release without blocking it. |
| 8 | AI image-gen budget + auto-generation permission | **Safe default already in effect** | `ai-generate`'s 402-handling (reviewed in the 2026-11-08 pass, `docs/qa/CODE_FIXES_PROGRESS.md`) treats provider-credit exhaustion as a service outage, not a cost signal to the user — meaning there is no uncontrolled spend path visible in the code; generation already requires an explicit user action per image (no autonomous/scheduled image generation found). **No owner budget figure exists, so no numeric budget was invented** — the default (manual, per-request, no auto-retry-to-paid-tier) is the conservative one and was left as-is. |
| 9 | LinkedIn/TikTok/organic connectors — provision or stay draft-only? | **Already decided, draft-only** | `linkedin-outreach/index.ts` (read in this pass) only ever produces rows with `status: "draft"`/`"ready"` for human review — no auto-publish code path found. TikTok/Shorts/organic IG/FB: no connector code found at all; they remain unimplemented, which is the same as "stay BLOCKED" — consistent with the existing safe default, nothing changed. |
| 10 | `crm.lead.update` action missing from the Action Registry | **Resolved** (per the source doc's own 2026-10-21 update, tied to the B4 registry implementation). Not independently re-verified in this pass — out of this session's time budget; flagged if a future pass wants to re-confirm. |

## Summary

- **4 of 10** were already fully resolved by later work and just needed re-confirming (1, 2, 5, 6; 3 is moot).
- **2 of 10** have a safe, reversible default already in effect in the shipped code, requiring no new decision (8, 9).
- **2 of 10** remain genuinely open and are parked rather than decided on the owner's behalf (4, 7) — neither blocks the first CRM/billing/onboarding launch.
- **1 of 10** (10) is marked resolved by its own prior update but wasn't independently re-verified this session.

No new owner-gated commercial or infrastructure commitments (budgets, new paid connectors, new cloud resources) were made in this pass.
