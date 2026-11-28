import { corsHeaders } from "./cors.ts";

/**
 * Pure paywall decision for subscriptionGate.ts. No remote imports, so it can
 * be unit-tested in CI without fetching from esm.sh.
 */

export const SUBSCRIPTION_REQUIRED = "subscription_required";

export type AccessLookup =
  | { ok: true; hasAccess: boolean }
  | { ok: false; error: string };

/**
 * Pure decision, kept separate so it can be unit-tested without a database.
 *
 * - Explicit "no access"  → 402 (fail closed).
 * - Lookup error          → allow, but log loudly. Locking every paying
 *   customer out because of a transient DB/RPC error would be worse than a
 *   few unpaid calls; the error is visible in logs/Sentry.
 */
export function decideGate(lookup: AccessLookup): Response | null {
  if (!lookup.ok) {
    console.error(`[subscriptionGate] access lookup failed, allowing request: ${lookup.error}`);
    return null;
  }
  if (lookup.hasAccess) return null;
  return new Response(
    JSON.stringify({
      error: SUBSCRIPTION_REQUIRED,
      message: "Your company has no active subscription or trial.",
    }),
    { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
