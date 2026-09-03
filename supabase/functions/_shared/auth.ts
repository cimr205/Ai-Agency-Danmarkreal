/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface AuthedCompanyContext {
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>;
  user: User;
  companyId: string;
}

/**
 * Extracts the bearer token, resolves the authenticated user, and looks up
 * their company_id. This boilerplate was previously copy-pasted across the
 * accounting-integration edge functions (dinero/economic oauth-start, sync,
 * disconnect) with no shared module — a future auth fix applied to one copy
 * and forgotten in the others would leave some endpoints under weaker auth.
 *
 * Returns an error Response the caller should `return` directly on failure,
 * or the resolved context on success.
 */
export async function requireCompanyAuth(req: Request): Promise<AuthedCompanyContext | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError("Missing auth", 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (authErr || !user) return jsonError("Unauthorized", 401);

  const { data: profile } = await supabase.from("profiles").select("company_id").eq("user_id", user.id).single();
  const companyId = profile?.company_id;
  if (!companyId) return jsonError("No company associated", 403);

  return { supabase, user, companyId };
}
