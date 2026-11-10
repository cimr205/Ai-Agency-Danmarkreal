# Onboarding 7/7 — First dashboard, activation and onboarding completion

## What already worked
Dashboard.tsx already shows real company context (no fake/placeholder data) — a personalized greeting, live KPI tiles backed by `useDashboard()`, and `EmptyLane` components with real CTAs (not dead buttons) when a section has no data yet. CRM/HR/Marketing dashboards (confirmed working in phases 5–6) already each have a genuine "create first X" primary action.

## What was found broken and fixed
- **A fake, permanently-stuck onboarding banner.** `Dashboard.tsx` showed a banner gated on `isOnboardingComplete()` (a `localStorage` flag) whenever `isAdmin` — but `markOnboardingComplete()` is called **nowhere in the entire codebase**. That means the banner was permanently stuck "incomplete" for every admin, forever, with a "Continue" button that just navigated to `/app/onboarding`, which immediately redirects straight back to `/app/dashboard` the moment a company already exists (per the guard added in phase 2/3) — a dead-end loop with no way to actually resolve it. Replaced entirely with a real, database-verified checklist (below).
- **No real completion tracking existed anywhere** — the spec's whole premise (progression must only be marked done if the underlying action succeeded, must survive refresh/logout/login) had nothing to attach to.

## What was built
- **`OnboardingChecklist.tsx`**: every item reflects live, independently-queried state — never a cached/optimistic flag:
  - Account created / Company created / Subscription activated (required) — company/subscription state via the existing `useAuth()`/`useSubscription()` (already real, from phases 1–3).
  - First employee invited / first integration connected / first task completed (optional, non-blocking) — each a direct `count` query against `invitations`/`integrations`/`tasks`, already RLS-scoped to the caller's own company (verified the relevant policies before relying on them). Because every item is recomputed from the database on each render rather than stored as a boolean, a task marked "complete" in the UI but never actually persisted (e.g. a failed insert) simply shows as not-done — there is no code path that can mark something done without the real row existing.
  - Required items hidden once all three are done; optional items never block anything, matching "valgfrie punkter må ikke blokere adgang."
- **Minimal, privacy-conscious activation analytics** (`product_events` table, written migration, NOT applied — no analytics existed in this codebase at all before this): `onboarding_started` (wizard mount), `company_created` (right after `bootstrap_company` succeeds), `subscription_activated` (server-side in the subscription webhook, deduped per company), `onboarding_completed` (once the three required checklist items are true), `first_value_action_completed` (wired into `useCreateLead` and `useCreateEmployee`'s existing `onSuccess` — the CRM and HR goals' least-complex value actions; the marketing goal's equivalent — "save first marketing task/campaign draft" — was **not** wired due to time, flagged below). No PII: only `company_id`/`user_id` and an event name from a closed, `CHECK`-constrained set. RLS: users can only log events for their own company (or no company, for the pre-company `onboarding_started` case); only company admins can read them back.

## Not done / explicitly flagged
- ~~`first_value_action_completed` for the marketing goal is not wired~~ — **done in a follow-up pass**: wired into `useSyncComposioConnection`'s success path (only when the connection actually confirms `status === "connected"`, not merely synced-but-still-pending), covering the spec's "connect a working channel" option for the marketing goal.
- **No deduping on `onboarding_completed`** — unlike `subscription_activated` (deduped server-side) and `first_value_action_completed` (deduped via an existence check), this one can log more than once across re-renders/sessions. Acceptable for activation analytics (it's a count/funnel signal, not billing), but worth knowing before building dashboards on top of it.
- Both are judgment calls made to stay within scope rather than oversights discovered late.

## Tests
- No new automated test for `OnboardingChecklist` or `productEvents.ts`, for the same reason as phase 6: no established pattern in this repo for mocking `supabase-js` inside a rendered component test. Verified via `type-check`/`lint`/`build` (all clean) and manual review of every query's RLS scoping (confirmed via `pg_policies`, not assumed).
- Full suite: 357 passed, 27 skipped, 0 failed.
- Manual browser verification (the full signup → company → subscription → dashboard → logout → login round trip described in the spec's acceptance criterion) was **not performed this session** — no Chrome extension connection and no live Stripe test credentials available. This is the single biggest gap across all 7 phases: everything here is verified by static analysis (types, lint, build, existing + new unit tests, RLS policy inspection) and code review, not by actually driving the flow end-to-end in a browser.

## Not deployed
Nothing in any of the 7 phases was deployed or migrated to production this session. Three migrations are written and pending approval:
1. `20261108144043_atomic_company_bootstrap.sql` (phase 2)
2. `20261108150512_invitation_seat_limit.sql` (phase 4)
3. `20261108152130_onboarding_goal.sql` (phase 6)
4. `20261108154501_product_events.sql` (phase 7)

All frontend/edge-function code changes across all 7 phases are committed to the working branch (`feature/dialer-calendar-design-and-errors`) only.
