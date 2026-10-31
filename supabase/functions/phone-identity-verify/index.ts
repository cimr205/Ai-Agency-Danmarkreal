import { requireCompanyAuth, jsonError } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getVerificationProvider } from "../_shared/verificationProvider.ts";

// PhoneIdentity ownership verification via SMS OTP. Deliberately separate
// from telephony_connections/cold-caller — this proves "this user controls
// this number," nothing more. It does NOT grant any calling capability.
//
// SMS delivery goes through the swappable VerificationProvider abstraction
// (see _shared/verificationProvider.ts) — this file never talks to Twilio
// or any other vendor directly, so the transport can change without
// touching this OTP logic or the onboarding UI.

const OTP_TTL_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

function normalizeNumber(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
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
  const verificationProvider = getVerificationProvider();

  try {
    // Checked by the UI before it even shows the phone-number step, so a
    // company with no SMS transport configured never sees a form that's
    // guaranteed to fail.
    if (action === "capability") {
      const result = await verificationProvider.isConfigured(supabase, companyId);
      return jsonResponse(result);
    }

    if (action === "send-otp") {
      const phoneNumber = (body.phoneNumber as string ?? "").trim();
      if (!phoneNumber) throw new Error("Missing phoneNumber");
      const normalized = normalizeNumber(phoneNumber);

      const capability = await verificationProvider.isConfigured(supabase, companyId);
      if (!capability.configured) {
        throw new Error(capability.reason ?? "SMS-verifikation er ikke tilgængelig for jeres virksomhed endnu.");
      }

      const { data: existing } = await supabase
        .from("phone_identities")
        .select("id, last_otp_sent_at, otp_send_count, verification_status")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .eq("normalized_number", normalized)
        .maybeSingle();

      if (existing?.last_otp_sent_at) {
        const secondsSince = (Date.now() - new Date(existing.last_otp_sent_at as string).getTime()) / 1000;
        if (secondsSince < OTP_RESEND_COOLDOWN_SECONDS) {
          throw new Error(`Vent ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSince)} sekunder før du beder om en ny kode.`);
        }
      }

      const code = generateOtp();
      const codeHash = await hashCode(code);
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

      const { data: row, error: upsertError } = await supabase
        .from("phone_identities")
        .upsert(
          {
            company_id: companyId,
            user_id: user.id,
            phone_number: phoneNumber,
            normalized_number: normalized,
            verification_status: "pending",
            otp_code_hash: codeHash,
            otp_expires_at: expiresAt,
            otp_attempts: 0,
            otp_send_count: (existing?.otp_send_count ?? 0) + 1,
            last_otp_sent_at: new Date().toISOString(),
          },
          { onConflict: "company_id,user_id,normalized_number" },
        )
        .select("id")
        .single();
      if (upsertError) throw new Error(upsertError.message);

      const sendResult = await verificationProvider.send(
        supabase,
        companyId,
        normalized,
        `Din bekræftelseskode er ${code}. Den udløber om ${OTP_TTL_MINUTES} minutter.`,
      );
      if (!sendResult.ok) {
        throw new Error(sendResult.error ?? "Kunne ikke sende SMS.");
      }

      return jsonResponse({ identityId: row.id, status: "pending", expiresAt });
    }

    if (action === "confirm-otp") {
      const phoneNumber = (body.phoneNumber as string ?? "").trim();
      const code = (body.code as string ?? "").trim();
      if (!phoneNumber || !code) throw new Error("Missing phoneNumber or code");
      const normalized = normalizeNumber(phoneNumber);

      const { data: row, error } = await supabase
        .from("phone_identities")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .eq("normalized_number", normalized)
        .single();
      if (error || !row) throw new Error("Ingen igangværende verifikation for dette nummer");

      if (row.verification_status === "verified") {
        return jsonResponse({ status: "verified" });
      }
      if (!row.otp_expires_at || new Date(row.otp_expires_at) < new Date()) {
        await supabase.from("phone_identities").update({ verification_status: "expired" }).eq("id", row.id);
        throw new Error("Koden er udløbet. Bed om en ny.");
      }
      if (row.otp_attempts >= MAX_OTP_ATTEMPTS) {
        throw new Error("For mange forsøg. Bed om en ny kode.");
      }

      const givenHash = await hashCode(code);
      if (givenHash !== row.otp_code_hash) {
        await supabase.from("phone_identities").update({ otp_attempts: row.otp_attempts + 1 }).eq("id", row.id);
        throw new Error("Forkert kode.");
      }

      const { error: updateError } = await supabase
        .from("phone_identities")
        .update({ verification_status: "verified", verified_at: new Date().toISOString(), otp_code_hash: null })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);

      return jsonResponse({ status: "verified" });
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("phone_identities")
        .select("id, phone_number, normalized_number, verification_status, verified_at, created_at")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return jsonResponse({ identities: data ?? [] });
    }

    if (action === "delete") {
      const identityId = body.identityId as string;
      if (!identityId) throw new Error("Missing identityId");
      const { error } = await supabase
        .from("phone_identities")
        .delete()
        .eq("id", identityId)
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
