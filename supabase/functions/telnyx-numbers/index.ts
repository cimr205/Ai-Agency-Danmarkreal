import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";

const TELNYX_API = "https://api.telnyx.com/v2";

function telnyxHeaders() {
  const apiKey = Deno.env.get("TELNYX_API_KEY");
  if (!apiKey) throw new Error("TELNYX_API_KEY is not configured");
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

async function telnyxFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${TELNYX_API}${path}`, { ...init, headers: { ...telnyxHeaders(), ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ctx = await requireCompanyAuth(req);
  if (ctx instanceof Response) return ctx;
  const { supabase, user, companyId } = ctx;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // no body
  }
  const action = body.action as string | undefined;

  try {
    const { data: isAdmin } = await supabase.rpc("is_company_admin", { _user_id: user.id });
    if (!isAdmin) throw new Error("Kun administratorer kan administrere telefonnumre.");

    // ─── Search available numbers — free, no purchase happens here ───
    if (action === "search") {
      const countryCode = (body.countryCode as string) || "DK";
      const params = new URLSearchParams({
        "filter[country_code]": countryCode,
        "filter[limit]": "20",
      });
      if (body.areaCode) params.set("filter[national_destination_code]", body.areaCode as string);

      const result = await telnyxFetch(`/available_phone_numbers?${params}`);
      if (!result.ok) throw new Error(`Søgning fejlede: ${JSON.stringify(result.body)}`);
      return jsonResponse({ numbers: result.body?.data ?? [] });
    }

    // ─── Order a number — REAL MONEY. Frontend must show an explicit confirmation before calling this. ───
    if (action === "order") {
      const phoneNumber = body.phoneNumber as string;
      if (!phoneNumber) throw new Error("Missing phoneNumber");

      const { data: config } = await supabase.from("telnyx_config").select("connection_id").eq("company_id", companyId).maybeSingle();
      if (!config) throw new Error("Opret jeres opkaldsforbindelse først (setup-connection), før I køber et nummer.");

      const order = await telnyxFetch("/number_orders", {
        method: "POST",
        body: JSON.stringify({
          phone_numbers: [{ phone_number: phoneNumber }],
          connection_id: config.connection_id,
        }),
      });
      if (!order.ok) throw new Error(`Køb fejlede: ${JSON.stringify(order.body)}`);

      // Once a number is owned, it becomes the workspace's default caller ID.
      const { error: updateError } = await supabase
        .from("telnyx_config")
        .update({ default_from_number: phoneNumber, status: "ready" })
        .eq("company_id", companyId);
      if (updateError) throw new Error(updateError.message);

      return jsonResponse({ orderId: order.body?.data?.id, phoneNumber });
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
