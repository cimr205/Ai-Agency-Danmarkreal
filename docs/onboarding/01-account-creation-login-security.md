# Onboarding 1/7 — Account creation, login, security

## What already worked
- Supabase Auth as the sole identity source (email/password + Google OAuth), via `AuthContext`.
- `ProtectedRoute` already gated protected pages on a valid session + company + subscription status, with retry-on-transient-error so a slow session attach doesn't bounce a paying user to a paywall.
- `resetPasswordForEmail` already doesn't reveal whether an email exists (Supabase's own behavior) — verified, not changed.

## What was fixed
- **Signup form**: split the single "full name" field into first/last name (UI only — `profiles.full_name` is still one column, values are joined before calling `signup()`; no schema change, per "reuse the existing architecture").
- **Password rules**: `signupSchema`/`resetPasswordSchema` now require 8+ chars, upper+lowercase, and a digit (previously length-only). Visible `PasswordStrength` meter retained.
- **Show/hide password**: new shared `PasswordInput` component, used on signup, login, and reset-password (previously none of them had it).
- **Terms/privacy acceptance**: required checkbox on signup, linking to the existing `/:/terms` and `/:/privacy` routes.
- **Redirect-after-login**: `ProtectedRoute` was already passing `state: { from: location }` to the login redirect, but `Login.tsx` never read it — users always landed on `/dashboard` regardless of what page they were trying to reach. Now honored; safe against open-redirect because `from` is a react-router `Location` object, not a raw URL string from the query string.
- **OAuth callback**: hardcoded Danish "Logger dig ind..." replaced with `t()`; added explicit handling for a provider error (`?error=...` / `#error=...`, e.g. the user cancelling the Google consent screen) instead of a silent 8-second spin before bouncing to login with no explanation.
- **Error messages**: all raw Zod/GoTrue English strings are now mapped through `describeValidationError` / `describeAuthError` to translated copy (en/da/de) — including "email already registered", weak-password, rate-limit, and network-error cases that previously fell through to the raw English message.

## Explicitly not built
- **Microsoft/Azure login**: no existing integration found anywhere in the codebase (no `azure` provider config, no UI). Per the brief ("if the existing integration supports it"), this was not implemented — it would need a new Azure AD app registration and Supabase provider config, which is a product/ops decision, not a code fix.

## Tests
- `src/test/auth-validations.test.ts` (unit, runs in CI): updated for the new schema shape + added coverage for weak-password rejection (short / no uppercase / no digit), missing terms acceptance, and the new `resetPasswordSchema`. 16/16 passing.
- `src/test/auth-flow.integration.test.ts` (new, same skip-if-no-service-key pattern as the existing `readonly-role.integration.test.ts`): successful registration, duplicate-email rejection, unconfirmed-user cannot log in, login/logout, wrong password, password-reset request (no enumeration), session refresh, and two authorization checks (anon cannot read `profiles`, a logged-in user cannot read another user's `profiles` row). **Not run in this session** — no `SUPABASE_SERVICE_ROLE_KEY` available here; it self-skips (10/10 skipped), same as the pre-existing integration suites.
- Full existing suite still green: 358 passed, 17 skipped (the 3 service-role-gated integration files), 0 failed.
- `npm run type-check` and `npm run build` both clean.
- Manual browser verification was not completed this session (the Chrome extension connection dropped mid-session) — the form renders and compiles correctly per the automated checks above, but click-through UX was not eyeballed.

## Not deployed
All changes are committed to the working branch only. Nothing was pushed to `main` or deployed, per "no production deployment without approval."
