import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// PhoneIdentity (ownership verification) must never be hardwired to a
// specific SMS vendor. Everything that actually talks to a vendor lives
// behind this interface — swapping Twilio for another SMS provider later
// means adding a new implementation here and changing `getVerificationProvider`,
// with zero changes to phone-identity-verify's OTP logic or the onboarding UI.

export interface SmsSendResult {
  ok: boolean;
  error?: string;
}

export interface VerificationProvider {
  readonly id: string;
  /** Can this company actually send an SMS right now? Checked before ever showing the phone-number step. */
  // deno-lint-ignore no-explicit-any
  isConfigured(supabase: SupabaseClient<any, any, any>, companyId: string): Promise<{ configured: boolean; reason?: string }>;
  // deno-lint-ignore no-explicit-any
  send(supabase: SupabaseClient<any, any, any>, companyId: string, toNumber: string, message: string): Promise<SmsSendResult>;
}

function twilioAuthHeader(creds: { account_sid: string; auth_token: string | null; api_key_sid: string | null; api_key_secret: string | null }) {
  if (creds.api_key_sid && creds.api_key_secret) {
    return "Basic " + btoa(`${creds.api_key_sid}:${creds.api_key_secret}`);
  }
  return "Basic " + btoa(`${creds.account_sid}:${creds.auth_token}`);
}

export const twilioSmsVerificationProvider: VerificationProvider = {
  id: "twilio_sms",

  async isConfigured(supabase, companyId) {
    const { data: twilioCreds } = await supabase
      .from("twilio_accounts")
      .select("account_sid, auth_token, api_key_sid, api_key_secret")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!twilioCreds) {
      return { configured: false, reason: "Ingen opkaldsforbindelse konfigureret for jeres virksomhed endnu." };
    }
    const { data: numberRow } = await supabase
      .from("phone_provisions")
      .select("phone_number")
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();
    if (!numberRow) {
      return { configured: false, reason: "Der mangler et afsendernummer til SMS-bekræftelse. Køb et nummer under Power Dialer → Konto." };
    }
    return { configured: true };
  },

  async send(supabase, companyId, toNumber, message) {
    const { data: twilioCreds } = await supabase
      .from("twilio_accounts")
      .select("account_sid, auth_token, api_key_sid, api_key_secret")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!twilioCreds) return { ok: false, error: "Ingen SMS-udbyder konfigureret." };

    const { data: numberRow } = await supabase
      .from("phone_provisions")
      .select("phone_number")
      .eq("company_id", companyId)
      .limit(1)
      .maybeSingle();
    if (!numberRow) return { ok: false, error: "Intet afsendernummer tilgængeligt til SMS-verifikation." };

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioCreds.account_sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader(twilioCreds),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: toNumber, From: numberRow.phone_number, Body: message }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Kunne ikke sende SMS: ${errText}` };
    }
    return { ok: true };
  },
};

// Single swap point for the whole app — add new providers here as they
// become available (e.g. a dedicated transactional-SMS vendor) without
// touching PhoneIdentity or the onboarding UI.
export function getVerificationProvider(): VerificationProvider {
  return twilioSmsVerificationProvider;
}
