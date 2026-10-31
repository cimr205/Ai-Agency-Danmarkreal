import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";

// Same-device "native mobile" connections only. Generic SIP was removed
// entirely (see migration 20260825000002) — cross-device calling now goes
// through mobile_devices/mobile-pairing instead. This file only remains for
// the case where a salesperson works directly from their phone's own
// browser and just needs tel: handoff on that same device, no pairing.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ctx = await requireCompanyAuth(req);
  if (ctx instanceof Response) return ctx;
  const { supabase, user, companyId } = ctx;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine for list-style actions
  }
  const action = body.action as string | undefined;

  try {
    if (action === "list") {
      const { data, error } = await supabase
        .from("telephony_connections")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return jsonResponse({ connections: data ?? [] });
    }

    if (action === "save-native-mobile") {
      const { phoneNumber, label } = body as Record<string, string>;
      if (!phoneNumber) throw new Error("Missing phoneNumber");

      const { data, error } = await supabase
        .from("telephony_connections")
        .upsert(
          {
            company_id: companyId,
            user_id: user.id,
            provider_type: "native_mobile",
            label: label ?? "Mobiltelefon",
            display_number: phoneNumber,
            normalized_number: phoneNumber.replace(/[^\d+]/g, ""),
            status: "registered",
          },
          { onConflict: "company_id,user_id,provider_type,normalized_number" },
        )
        .select()
        .single();
      if (error) throw new Error(error.message);
      return jsonResponse({ connection: data });
    }

    if (action === "delete") {
      const { connectionId } = body as { connectionId: string };
      if (!connectionId) throw new Error("Missing connectionId");

      const { error } = await supabase
        .from("telephony_connections")
        .delete()
        .eq("id", connectionId)
        .eq("company_id", companyId)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
      return jsonResponse({ success: true });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 400);
  }
});

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
