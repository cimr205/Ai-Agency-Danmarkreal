# Version 2 Status — 2026-11-11

## Executive summary

Version 2's stated premise — CRM, HR, Marketing, Finance, Lead Generation and Social Suite working together through Mastra-based AI agents — **does not match the live system**. The Mastra agent layer (`src/mastra/*`) is real, well-architected, and unit-tested, but has **zero live invocation path**: no edge function, API route, or UI calls it. `src/mastra/index.ts` says so explicitly — it registers only a diagnostic agent and documents the department agents as "intentionally NOT implemented here."

What actually runs in production today is a **separate, simpler set of direct Supabase edge functions**, built independently of Mastra, with real (if partial) frontend wiring. This report verifies those — the things actually reachable by a user — rather than continuing to build toward a Mastra pipeline nothing calls, per the user's explicit direction this session.

Also fixed this session: the trial-overwrite billing vulnerability was found still live in production (deployed before this session's earlier fix commit existed) and has now been **deployed** to the live `create-checkout` edge function (version 51, verified by reading the deployed source back).

## Per-module reality check (live-verified: deployed-function list + frontend grep, not full E2E)

| Module | What Phase C/D/E asked for | What's actually live | Gap |
|---|---|---|---|
| **CRM** | AI analyzes leads/deals, suggests next action | `lead-ai-recommend` and `deal-coach` edge functions are **deployed and wired** to real UI (`usePipeline.ts`, `DealCoachPanel.tsx`). Both authenticate, scope every query by `company_id`, and enforce a usage quota (`increment_usage_quota`) before calling the AI — real cost control already in place. | **Zero automated tests** for either function — the thing users actually touch is untested, while the unused Mastra equivalent (`lead-prioritizer.ts`) has full test coverage. |
| **Lead Generation** | Search → import → CVR enrichment → CSV import/export | `lead-gen-api` (wired, `useLeadGen.ts`, tenant-scoped) and `cvr-search` (wired, `CvrLookupField.tsx`) are live. CSV import (`csv-import-leads`) is wired to `LeadsPage.tsx`/`CsvImportWizard.tsx`. | `lead-generation-chat` edge function **is deployed but has no frontend caller anywhere** — the "describe what you're looking for, get results" chat flow from §10 has no UI entry point despite the backend existing. |
| **HR** | Roster suggestions, staffing-gap analysis | **Nothing live.** No edge function, no frontend hook calls any HR-AI capability. The only HR-AI code is the orphaned Mastra `staffing-gaps.ts`/`roster-suggester.ts` — unit-tested, never reachable by a user. |
| **Finance** | Invoice analysis, overdue payments, cashflow/revenue analysis | **Nothing live for AI analysis.** `useFinance.ts` (318 lines) is plain CRUD — zero `supabase.functions.invoke` calls, zero AI. The Mastra finance agents (`overdue-invoices.ts`, `cashflow-*`, `revenue-analysis.ts`) are unit-tested, never wired. |
| **Marketing / Social Suite** | Generate + persist content, connect social accounts, publish | `meta-ads-ai`, `meta-publish-campaign`, `linkedin-outreach` are all **deployed and wired** to real UI (`CreateCampaignWizard.tsx`, `MetaQuickAnalyst.tsx`, `MetaAIAdGenerator.tsx`, `useLinkedInOutreach.ts`), including a real OAuth callback page. This module is in notably better shape than HR/Finance. |

## Why this matters for the Definition of Done

Masterprompt §5 criterion 2 ("Alle inkluderede AI-agenter kan udføre deres tilsigtede arbejdsopgaver sikkert") cannot be marked done for HR and Finance — there is no agent execution path to secure, test, or verify. It would be a false completion to report otherwise.

Criterion 3 (CRM + Lead Gen work together) is **partially true**: CRM and most of Lead Generation are live and tenant-scoped; the chat-based lead search specifically is not reachable.

Criterion 4 (HR and Finance tested with controllable results) **cannot be satisfied** — there's nothing running to test against real data; only the disconnected Mastra unit tests exist, which test the agent logic in isolation, not any real user flow.

## What was NOT done this session (honestly blocked, not faked)

- **Live Stripe test-mode matrix, live cross-tenant E2E, live social-media publish to a sandbox account, browser-driven onboarding walkthrough** — none of this environment's tools provide Stripe test keys, a second authorized test tenant, or a connected social sandbox account. Each would need to be explicitly provisioned by the owner.
- **Wiring the Mastra agent layer into a live path** — explicitly deferred this session per the user's own prioritization choice (verify what exists over building new plumbing), given it's a multi-day effort across ~15 agents (new edge function per agent + auth + approval UI + audit wiring, following the `ai-operating-manager` pattern already proven for `crm.lead.update`).
- Dokploy configuration and the Social Suite's outstanding migrations were not re-examined this session (unchanged from the 2026-11-07 audit — still pending VM deploy).

## Recommendation (not a decision made unilaterally — flagging for the owner)

Two honest paths forward, not decided here:
1. **Treat "Mastra-based" as the target architecture for a later phase**, and in the meantime harden what's actually live: add test coverage to `lead-ai-recommend`/`deal-coach`, wire `lead-generation-chat` into the UI, and — if HR/Finance AI is wanted for this release — build direct edge functions for them following the exact same pattern as `lead-ai-recommend` (fastest path to something real) rather than waiting on the Mastra wiring.
2. **Commit to wiring Mastra properly** before claiming any agent capability is "done" — slower, but matches the architecture Version 2 actually describes. This is the `ai-operating-manager`/`crm.lead.update` pattern already proven once in `B4_LEAD_UPDATE_VERIFICATION.md`; it would need to be repeated per agent.

## Test results (this session, re-verified)

| Gate | Result |
|---|---|
| `npx vitest run` | 372 passed, 0 failed, 27 skipped (service-role-gated) — unchanged from Fase A check |
| `create-checkout` deploy (trial-overwrite fix) | Deployed to production, version 51, verified by reading the live function's source back — matches the fixed local code exactly |

## GO / CONDITIONAL GO / NO-GO for Version 2 as specified

**NO-GO**, for Version 2 as literally specified (a Mastra-orchestrated cross-module platform). The core architectural claim — agents working together through Mastra — is not true of the running system, and building it is out of this session's scope.

**CONDITIONAL GO** for a narrower, honest release: CRM (lead-ai-recommend, deal-coach, lead-gen-api, cvr-search, csv-import), billing (trial-overwrite fix now deployed), and Marketing/Social Suite's Meta/LinkedIn flows are live, tenant-scoped, and reachable today. Condition: add test coverage for `lead-ai-recommend`/`deal-coach` before calling this release's AI behavior "verified" rather than "implemented and live but untested." HR and Finance AI features should be explicitly marked as **not available** in this release rather than implied to exist, since nothing currently serves them.
