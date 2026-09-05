# Power Dialer — current state (as of 2026-09-05)

Per explicit instruction: this documents what actually exists, without inventing or implying completeness that isn't there. This also corrects a stale plan: an earlier session plan (`docs/../plans` — "Phase D: Twilio Verified Caller ID") describes a Twilio-based architecture that **no longer matches the live code** — see "Superseded plan" below.

## What it is now: the Phone Companion model

Power Dialer (`marketing/cold-caller` route, `src/pages/app/marketing/ColdCallerPage.tsx`) works by pairing the web app with the employee's own physical phone (iPhone or Android) over a secure QR/six-digit code, then sending that phone "please call this lead" commands. **The actual carrier call happens on the phone's own SIM/eSIM and subscription** — there is no Twilio, no purchased virtual number, and no per-minute platform telephony charge in this model. The employee's real personal number is the caller ID by construction, not via a verified-caller-ID workaround.

Full protocol is documented in `docs/PHONE_COMPANION_PROTOCOL.md` (production-quality spec, live-matches the code): pairing via `create_phone_pairing_session()` → device claims a token via `phone-device-relay` (`action=claim`) → device heartbeats every 30s → web issues call commands via `create_phone_call_command()` RPC → device polls/acknowledges via the same relay → command moves through `queued → delivered → acknowledged → awaiting_confirmation? → ringing → connected → completed` (or a terminal failure state).

**Verified live in this workspace** (2026-09-05): the dialer page loads correctly, shows "Connect a nearby phone" pairing UI (QR/6-digit, Mac/Windows × iPhone/Android combinations), and a working lead queue — 1 real lead ("Cimraan") populated from `useLeads`, session/stats counters (Leads remaining, Logged this session, Calls today, Callbacks logged) all rendering. No phone was actually paired during this pass (would require a second physical device) — pairing/call-relay itself was not live-tested end-to-end, only the web-side UI and lead-queue population.

### Real, documented platform limitations (not bugs — physics/OS constraints)
- iOS **cannot** be silently triggered to place a carrier call from a web backend; the user must tap to confirm every time (Apple restriction, not a shortcut this codebase failed to find).
- Android *can* go one-click (`ACTION_CALL`) once the user has granted `CALL_PHONE` permission during onboarding; without it, falls back to `ACTION_DIAL` (opens the dialer, still requires a tap).
- Neither platform can reliably report a true "connected" event for a cellular call — the protocol doc explicitly forbids fabricating one.
- No native iOS/Android app ships in this repo — the "companion" is currently the web page at `/:locale/phone-companion` (`src/pages/PhoneCompanionPage.tsx`); the protocol doc's Kotlin/SwiftUI sections describe a future native app, not something built and shipped yet.

## Superseded plan: Twilio Verified Caller ID (do not build)

An earlier planning pass in this session (recorded plan, "Phase D") designed a Twilio Verified-Caller-ID feature — `verified_caller_ids` table, `start-caller-id-verification`/`check-caller-id-status` actions on a `cold-caller` edge function, per-user number verification via Twilio's `OutgoingCallerIds` API. **That edge function no longer exists** (`supabase/functions/cold-caller` is gone from this repo; only `phone-device-relay`, `phone-provision`, `phone-release` remain under `supabase/functions/`), and `ColdCallerPage.tsx` has zero Twilio references today. The product was rebuilt around the Phone Companion model instead, which achieves the same underlying goal (call shows the employee's real personal number) more directly — no verification flow needed, since the call physically originates from the employee's own phone. **This plan's Phase D should be treated as stale and not implemented** — building it now would duplicate/conflict with the shipped Phone Companion architecture.

## Remaining, unverified pieces

- `supabase/functions/phone-provision` and `phone-release` still exist in the codebase — their exact current role (company-purchased virtual numbers as a fallback/alternate calling path, versus dead code left over from the pre-Companion architecture) was not traced in this pass; flagged for a follow-up rather than guessed at here.
- `src/pages/app/marketing/ColdCallerPage.test.tsx` exists but likely tests against the pre-rewrite component shape — worth checking in the dead-code/test-suite sweep (not fixed in this pass; flagged only).
- End-to-end pairing and a real call command round-trip (phone actually rings, employee confirms, status reaches `connected`/`completed`) was not live-tested — doing so would require a second physical device paired to this workspace, which wasn't available in this pass.
