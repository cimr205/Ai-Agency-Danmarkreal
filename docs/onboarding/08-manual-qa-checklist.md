# Manual QA checklist — full onboarding flow (phases 1–7)

This is the one gap no automated check in this repo can close: a real browser,
driven by a human (or a working Chrome extension connection), walking the
actual signup → company → subscription → team → integrations → goal →
dashboard path end to end. Everything below is derived from the 7 phase docs
in this folder — use it as the acceptance test for that work before
considering it production-ready.

Prerequisites before starting:
- [ ] `.env.local` points at `vbxlpxhvojlaisxcipyh` (the live project) if testing locally — see phase 1 notes about the earlier `.env.local` drift bug.
- [ ] `stripe-subscription-webhook` registered in the Stripe Dashboard with a signing secret set as `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` (currently NOT done — subscription status changes won't sync without this).
- [ ] Stripe is in **test mode** with test card `4242 4242 4242 4242` — never use a real card for this.

## 1. Account creation & login
- [ ] Sign up with first/last name, work email, a password missing uppercase → rejected with a clear, translated message (not raw English).
- [ ] Same, missing a digit → rejected.
- [ ] Sign up without checking the terms checkbox → blocked, clear message.
- [ ] Password field has a working show/hide toggle.
- [ ] Sign up with an email that already has an account → clear "already registered" message, no raw GoTrue English leaking through.
- [ ] Complete signup, confirm email (or note if email confirmation is disabled on this project) → lands in company onboarding.
- [ ] Log out, log in with correct credentials → lands back on dashboard (not forced through onboarding again).
- [ ] Log in with wrong password → generic "incorrect email or password", not "no such user" (enumeration check).
- [ ] Use "forgot password", request reset for a real and a fake email → both show the same "check your email" response (no enumeration).
- [ ] Click an **expired or already-used** reset link → see the new "this link is invalid or expired" screen (phase 1 fix), not a broken form.
- [ ] While logged out, navigate directly to `/en/app/dashboard` → redirected to login; after logging in, land back on the dashboard (not a generic page) — tests the phase 1 redirect-after-login fix.
- [ ] Try Google login if a client ID is configured; cancel the Google consent screen partway through → see the new "sign-in could not be completed" screen (phase 1 fix), not an 8-second silent spinner.

## 2. Company / workspace creation
- [ ] On the company step, country defaults to Denmark and a CVR lookup field is visible.
- [ ] Enter a real CVR number → company name/address auto-fill (phase 2 fix — this previously 403'd for every new signup).
- [ ] Switch country away from Denmark → CVR field disappears, nothing is required there.
- [ ] Submit the company form → company created in one step (watch network tab: one `bootstrap_company` RPC call, not three separate requests).
- [ ] Immediately refresh mid-flow (before Stripe redirect) → no duplicate company created for the same user.

## 3. Subscription
- [ ] **Verify the actual Stripe price first** — this was never confirmed this session. Open Stripe Dashboard → Products, check the unit amount on `price_1TIWHDRmhuA1UO2DtPQydBJs` matches the "499 kr." shown everywhere in the app (pricing page, onboarding, subscription page, legal docs). If it doesn't, that's a separate bug to file.
- [ ] Start checkout, use Stripe's test card, let it succeed → redirected to dashboard with a **visible toast** confirming the subscription ("Subscription activated" — phase 3 fix; this toast didn't exist before and the query param that drives it was previously being dropped on the way back).
- [ ] Start checkout again as a *different*, non-admin company member → blocked with a clear permission error (phase 3 fix — previously any employee could start billing).
- [ ] As that same non-admin employee, try opening "Manage subscription" (customer portal) → blocked (phase 3 fix — previously any employee could cancel the subscription).
- [ ] Start checkout, then click **back/cancel** on the Stripe page → redirected to the dashboard with a "payment was cancelled" toast (phase 3 fix), not silence.
- [ ] As the admin, open the subscription page → purchased seat count is visible (phase 3 fix — this wasn't shown before at all).

## 4. Invitations
- [ ] Invite an employee → seat usage ("X of Y seats used") visible on the invitations page (phase 4 fix).
- [ ] Fill all paid seats, then try to accept a pending invitation as a new user → rejected with a clear "no seats available" message, and confirm that user's profile is **not** silently linked to the company (phase 4 fix — previously there was no seat check at all here).
- [ ] Free up a seat (or add seats), retry accepting the same invitation → succeeds.
- [ ] Click an invite link as a brand-new user → the signup form's email field is pre-filled and **locked** to the invited address (phase 4 fix — previously it was blank and a mismatch silently disabled the accept button with no explanation).
- [ ] Find an expired invitation on the invitations page → a "resend" button is present and works (phase 4 fix).

## 5. Integrations & data import
- [ ] Mid-onboarding (before any company subscription exists), try a CVR lookup again from a different entry point if available → should not 403.
- [ ] Open "Connected apps" → the four live modules (Calendar, Documents, CRM sync, Payments) are clearly marked as actually wired to a feature; everything else is marked "not yet connected to a feature."
- [ ] Import a CSV of leads where a couple of rows are malformed in a way that would fail insertion (e.g. duplicate unique constraint, or an overly long field) → the result screen shows a **"Failed: N"** count with specific error detail, not just a silently-lower imported count (phase 5 fix).
- [ ] Repeat the import in English and German locale → the "CSV import requirements" box and example-download button are translated, not hardcoded English (phase 5 fix).

## 6. Personal goal
- [ ] First dashboard visit after setup → a goal-picker modal appears (CRM / HR / Marketing), each with the 3 specific capabilities listed in the spec, not generic marketing copy.
- [ ] Pick "CRM" → routed to `/crm/dashboard`, not the generic overview.
- [ ] Log out, log back in → the goal picker does **not** reappear (preference persisted).
- [ ] Have a second user in the same company pick a different goal → does not overwrite the first user's preference (per-user, not per-company).
- [ ] Click the "X"/skip on the picker → dismissed without blocking anything, lands on the generic dashboard.

## 7. First dashboard & activation
- [ ] Dashboard shows the real company name, no placeholder/fake example data anywhere.
- [ ] A live, checkbox-style "Setup checklist" is visible (not the old permanently-stuck banner that used to show regardless of actual progress) — confirm it actually reflects real state: e.g. invite someone, refresh, see "first employee invited" flip to done.
- [ ] As a CRM-goal user, create a first lead → "first value action" is recorded (can be confirmed via Supabase Table Editor on `product_events`, filtered to `first_value_action_completed`, admin-only).
- [ ] As an HR-goal user, create a first employee → same check.
- [ ] Log out and back in with partial onboarding progress (e.g. no subscription yet) → required checklist items still show as incomplete, optional ones (invite/integration/task) don't block anything.
- [ ] Full round trip: new signup → company → subscription → invite a teammate → connect nothing → pick a goal → create one real record → log out → log in → confirm everything above survived.

## Known gaps going in (don't re-report these as new bugs — they're already documented)
- Stripe price (499 kr.) unverified against the live Stripe configuration.
- `stripe-subscription-webhook` needs Stripe Dashboard registration before subscription status syncs automatically from Stripe-side events (cancellations, failed payments) — until then, `check-subscription`'s polling is the only sync path.
- Marketing goal's "first value action" isn't wired to a specific mutation yet (CRM and HR are).
- `onboarding_completed` analytics event isn't deduped (can log more than once) — don't be alarmed by duplicate rows for that one event name specifically.
