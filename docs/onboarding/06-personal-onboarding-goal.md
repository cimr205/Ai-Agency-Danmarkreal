# Onboarding 6/7 — Personal onboarding and goal selection

## What this phase was
Unlike the previous five phases, this one was a genuinely new feature — no goal-selection step existed anywhere in the codebase (confirmed via search: no `onboarding_goal`, no equivalent component). Built it from the real, working modules confirmed in phase 5's investigation (`ConnectedAppsPage.tsx`'s own audit of what's actually wired up) rather than inventing new ones.

## What was built
- **`profiles.onboarding_goal`** (new column, written migration, NOT applied): `'crm' | 'hr' | 'marketing' | null`, stored **per user** (not per company) — the spec explicitly warns against one employee's choice overwriting a colleague's, and `profiles` is already the per-user table in this schema.
- **`OnboardingGoalPicker.tsx`**: a lightweight modal shown once, offering the exact three choices from the brief (sales/CRM, HR, marketing), each listing only the specific sub-capabilities named in the spec and already confirmed working (leads/deals/follow-ups; employee overview/shift scheduling/working hours; campaigns/channels/marketing tasks) — not a generic "explore everything" pitch.
- On choosing, saves the preference and **routes to the matching dashboard** (`crm/dashboard`, `hr/dashboard`, or `marketing/dashboard` — all three routes already existed and already use the real, data-backed cockpit components audited in earlier phases) instead of the generic overview.
- A dismiss ("skip for now") option — the spec doesn't explicitly require one for this step, but blocking access entirely for a UI preference would contradict this project's general "no dead ends" posture; skipping just means the generic dashboard stays the default, same as today.

## A deliberate safety constraint worth calling out
`profiles.onboarding_goal` doesn't exist in the live database yet (migration pending approval). **`AuthContext.tsx`'s core profile fetch — run on every single authenticated page load — was deliberately left untouched.** I initially added the column to that query and then reverted it: that function has no error-tolerant path, so querying a column that doesn't exist yet would have broken every page load app-wide the moment this branch deployed, long before anyone actually approves and applies the migration. Instead, `OnboardingGoalPicker` does its own isolated, silently-failing query — if the column isn't live yet, the component just never shows itself, rather than taking down the dashboard. This is a different safety posture than phases 2/4 (where the new RPCs are only called from an explicit, already-error-handled user action) and was worth being careful about specifically because this one sits on the universal auth path.

## Schema / migration (written, NOT applied)
`supabase/migrations/20261108152130_onboarding_goal.sql` — adds the column with a `CHECK` constraint restricting it to the three valid values (or null).

## Tests
- No new automated test — `OnboardingGoalPicker` is a Supabase-backed component, and this repo's test suite has no established pattern for mocking `supabase-js` inside a rendered React component test (the existing `*.test.tsx` files that render components don't mock the Supabase client); building a new mocking harness just for this one component was out of scope for "reuse the existing architecture." Verified via `type-check`, `lint`, and `build` (all clean) plus manual code review of the error-tolerant query path described above.
- Full suite: 357 passed, 27 skipped, 0 failed.
- Manual browser verification not completed this session (Chrome extension connection unavailable, and the feature depends on the pending migration being live to actually exercise end-to-end).

## Not deployed
Component code is committed to the working branch only. The migration is written but not applied — the feature is inert in production until it is.
