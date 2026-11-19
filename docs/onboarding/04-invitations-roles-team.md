# Onboarding 4/7 — Employee invitations, roles and team

## What already worked (verified, not rebuilt)
The invitation system was already solidly built: `create_invitation`/`accept_invitation` use hashed tokens (only the raw one-time token is ever returned, never stored or re-readable), intended-recipient-only acceptance (caller's auth email must match the invitation's email, case-insensitively), expiry handling, pending-status checks, "can't accept into two companies," and admin-only creation (`is_company_admin()`). Self-escalation protection (a user can't grant themselves a higher role) already has dedicated prior migrations (`fix_self_escalation_triggers`, `restrict_employee_self_update_columns`) — re-verified these are in place rather than re-auditing role escalation from scratch.

## What was fixed
- **No seat-limit enforcement at all.** `accept_invitation()` let a company accept unlimited invitations regardless of its actual subscription — no check against `purchased_seats` (active) or `seat_limit_trial` (trialing) anywhere. Per the spec's "define one consistent rule" requirement: **seats are counted at acceptance, not at invite time** — this matches what the codebase's own `check-subscription` seat-mismatch logic already counts (live `profiles` rows, i.e. actual members), so it's not a new convention, just making `accept_invitation` consistent with it. Invitations themselves stay free to send even when full (an invite can sit pending until a seat frees up or more are purchased) — only *accepting* past the limit is blocked.
- **Invited users had to retype their email on signup**, with nothing preventing them from typing something different than the invitation's email — which would then silently fail the "accept" button's email-match check with no explanation of why. `AcceptInvite.tsx` now passes the invitation's email through to Signup via the existing redirect-URL mechanism; `Signup.tsx` pre-fills and locks that field when present.
- **No seat count visible anywhere** ("Vis antal ledige brugerpladser" from the spec) — `InvitationsPage.tsx` now shows a "Seats used X/Y" stat card (via a new `get_seat_usage()` RPC) and a warning in the invite dialog when seats are full.
- **No way to resend an expired invitation** from the UI — `create_invitation` already permits re-inviting an email once its prior pending invite is expired (the "duplicate pending invite" guard only blocks *non-expired* pending ones), so the backend already supported this; just added a "resend" button on expired/stale rows that calls it.
- **Hardcoded English string** in the invite-link dialog ("Copy this invite link now...") — translated.

## Schema / migration (written, NOT applied)
`supabase/migrations/20261108150512_invitation_seat_limit.sql`:
- Adds the seat-limit check to `accept_invitation()`.
- Adds `get_seat_usage()` (returns the caller's company's seat limit + used count) for the UI.

**Not applied to the live project** — no production migration without approval. `InvitationsPage.tsx` calls `get_seat_usage()` through a narrow, commented type cast (same pattern as phase 2's `bootstrap_company` cast) until the migration lands and types are regenerated.

## Tests
- `src/test/invitation-seat-limit.integration.test.ts` (new, same skip-pattern): rejects accepting when the company has no free seats, confirms the invitee's profile is *not* linked to the company on rejection (no partial state), and accepts once a seat frees up. Not run this session — needs the pending migration applied + service key; skips cleanly (2/2 skipped).
- Full suite: 357 passed, 27 skipped (6 service-role-gated integration files), 0 failed. `type-check` and `build` clean.
- Role-escalation and cross-tenant invitation-acceptance behavior relies on the prior, already-shipped migrations referenced above — not re-tested from scratch this round; flagging as verified-by-reading rather than independently re-proven.
- Manual browser verification not completed this session (no live, logged-in multi-user setup available without the Chrome extension connection and without a real paid subscription to test seat limits against end-to-end).

## Not deployed
Code changes committed to the working branch only. The migration is written but not applied.
