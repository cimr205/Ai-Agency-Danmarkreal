import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Telnyx → our backend → CRM. This is the ONLY place that understands raw
// Telnyx event payloads — everything downstream (call_sessions, Realtime,
// PowerDialerEngine) only ever sees the normalized event model.
//
// Signature verification (Ed25519, per Telnyx's documented scheme):
// signed string = `${telnyx-timestamp}|${raw_body}`, signature in the
// `telnyx-signature-ed25519` header (base64), verified against
// TELNYX_PUBLIC_KEY (also base64, fetched once via telnyx-credential's
// get-public-key action and stored as a Supabase secret).

async function verifySignature(rawBody: string, signatureB64: string, timestamp: string): Promise<boolean> {
  const publicKeyB64 = Deno.env.get("TELNYX_PUBLIC_KEY");
  if (!publicKeyB64) {
    console.error("TELNYX_PUBLIC_KEY not configured — rejecting webhook");
    return false;
  }
  try {
    const publicKeyBytes = Uint8Array.from(atob(publicKeyB64), (c) => c.charCodeAt(0));
    const signatureBytes = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", publicKeyBytes, { name: "Ed25519" }, false, ["verify"]);
    const signedData = new TextEncoder().encode(`${timestamp}|${rawBody}`);
    return await crypto.subtle.verify("Ed25519", key, signatureBytes, signedData);
  } catch (err) {
    console.error("Signature verification error", err);
    return false;
  }
}

// Maps Telnyx's call_control event_type values to our normalized statuses.
// Only this function needs to change if Telnyx's event names change.
function normalizeStatus(eventType: string): string | null {
  switch (eventType) {
    case "call.initiated": return "dialing";
    case "call.ringing": return "ringing";
    case "call.answered": return "answered";
    case "call.hangup": return "ended";
    default: return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rawBody = await req.text();
  const signature = req.headers.get("telnyx-signature-ed25519");
  const timestamp = req.headers.get("telnyx-timestamp");

  if (!signature || !timestamp) {
    return new Response(JSON.stringify({ error: "Missing signature headers" }), { status: 401 });
  }

  const valid = await verifySignature(rawBody, signature, timestamp);
  if (!valid) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let payload: { data?: { id?: string; event_type?: string; occurred_at?: string; payload?: Record<string, unknown> } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const eventId = payload.data?.id;
  const eventType = payload.data?.event_type;
  const eventPayload = payload.data?.payload ?? {};

  // Idempotency: Telnyx may redeliver the same event; only process once.
  if (eventId) {
    const { error: insertError } = await supabase.from("telnyx_webhook_events").insert({ event_id: eventId });
    if (insertError) {
      // unique_violation = already processed this event, ack without reprocessing
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({ ok: true, deduplicated: true }), { headers: corsHeaders });
      }
      console.error("Failed to record webhook event id", insertError);
    }
  }

  const status = eventType ? normalizeStatus(eventType) : null;
  const callControlId = eventPayload?.call_control_id as string | undefined;

  if (status && callControlId) {
    const patch: Record<string, unknown> = { status };
    const occurredAt = payload.data?.occurred_at ?? new Date().toISOString();
    if (status === "ringing") patch.ringing_at = occurredAt;
    if (status === "answered") patch.answered_at = occurredAt;
    if (status === "ended") {
      patch.ended_at = occurredAt;
      const hangupCause = eventPayload?.hangup_cause as string | undefined;
      patch.metadata = { hangup_cause: hangupCause };
    }

    const { error: updateError } = await supabase
      .from("call_sessions")
      .update(patch)
      .eq("provider_call_id", callControlId);
    if (updateError) console.error("Failed to update call_sessions from webhook", updateError);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
});
