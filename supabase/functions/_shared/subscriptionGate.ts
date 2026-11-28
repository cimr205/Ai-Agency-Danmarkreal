import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

/**
 * Server-side paywall (milestone "Paid means paid", platform audit P0-1).
 *
 * The browser gate in ProtectedRoute only hides pages; anyone with a valid
 * session could still call billable edge functions directly. Paid features
 * (LLM calls, provider sends, lead generation) call this after resolving the
 * caller's company and return its Response when it is not null.
 *
 * The rule itself lives in SQL (public.company_has_access) so edge functions
 * and RLS share one definition.
 */

import { decideGate } from "./subscriptionDecision.ts";
export { decideGate, SUBSCRIPTION_REQUIRED } from "./subscriptionDecision.ts";
export type { AccessLookup } from "./subscriptionDecision.ts";

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Gate by company id (when the caller already resolved it). */
export async function requireActiveCompany(companyId: string): Promise<Response | null> {
  const { data, error } = await serviceClient().rpc("company_has_access", { _company_id: companyId });
  if (error) return decideGate({ ok: false, error: error.message });
  return decideGate({ ok: true, hasAccess: data === true });
}

/** Gate by user id: resolves profiles.company_id first. No company → 402. */
export async function requireActiveSubscription(userId: string): Promise<Response | null> {
  const db = serviceClient();
  const { data: profile, error } = await db.from("profiles").select("company_id").eq("user_id", userId).maybeSingle();
  if (error) return decideGate({ ok: false, error: error.message });
  if (!profile?.company_id) return decideGate({ ok: true, hasAccess: false });
  return requireActiveCompany(profile.company_id as string);
}
