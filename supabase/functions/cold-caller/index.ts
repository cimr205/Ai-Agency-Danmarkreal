import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getTwilioCreds(serviceClient: any, companyId: string) {
  const { data, error } = await serviceClient
    .from("twilio_accounts")
    .select("account_sid, auth_token, balance, balance_currency, last_balance_check")
    .eq("company_id", companyId)
    .single();
  if (error || !data) return null;
  return data;
}

async function syncPhoneProvisionRecords(serviceClient: any, companyId: string, phoneNumbers: Array<{ sid?: string; phone_number?: string }>) {
  const validNumbers = phoneNumbers.filter((n) => n.sid && n.phone_number);
  if (validNumbers.length === 0) return;

  const twilioSids = validNumbers.map((n) => n.sid as string);
  const { data: existing } = await serviceClient
    .from("phone_provisions")
    .select("twilio_sid")
    .eq("company_id", companyId)
    .in("twilio_sid", twilioSids);

  const existingSids = new Set((existing || []).map((row: { twilio_sid: string | null }) => row.twilio_sid).filter(Boolean));
  const missing = validNumbers
    .filter((n) => !existingSids.has(n.sid as string))
    .map((n) => ({
      company_id: companyId,
      phone_number: n.phone_number as string,
      twilio_sid: n.sid as string,
    }));

  if (missing.length > 0) {
    const { error } = await serviceClient.from("phone_provisions").insert(missing);
    if (error) {
      console.error("cold-caller phone provision sync failed", error);
    }
  }
}

function twilioAuth(sid: string, token: string) {
  return "Basic " + btoa(`${sid}:${token}`);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isTransientTwilioError(error: unknown) {
  return /reset by peer|ECONNRESET|connection closed|connection refused|network|timed? ?out|EOF|os error 104|os error 32/i
    .test(getErrorMessage(error));
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function safeTwilioRequest(url: string, init?: RequestInit) {
  try {
    const response = await twilioFetch(url, init);
    return { response, fallback: false };
  } catch (error) {
    if (isTransientTwilioError(error)) {
      return {
        response: null,
        fallback: true,
        error: "Twilio er midlertidigt utilgængelig. Prøv igen om et øjeblik.",
      };
    }
    throw error;
  }
}

async function validateTwilioCredentials(accountSid: string, authToken: string) {
  const testCheck = await safeTwilioRequest(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
    { headers: { Authorization: twilioAuth(accountSid, authToken) } }
  );

  if (testCheck.fallback) {
    return testCheck;
  }

  const testRes = testCheck.response!;
  if (!testRes.ok) {
    const errorBody = await testRes.text();
    console.error("cold-caller Twilio validation failed", {
      status: testRes.status,
      accountSid,
      body: errorBody,
    });
    throw new Error("Ugyldige Twilio-oplysninger. Tjek dit Account SID og Auth Token.");
  }

  const accountData = await testRes.json();

  const balRes = await twilioFetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`,
    { headers: { Authorization: twilioAuth(accountSid, authToken) } }
  );

  let balance = 0;
  let balanceCurrency = "USD";
  if (balRes.ok) {
    const balData = await balRes.json();
    balance = parseFloat(balData.balance || "0");
    balanceCurrency = balData.currency || "USD";
  }

  return {
    fallback: false,
    accountData,
    balance,
    balanceCurrency,
  };
}

function isValidationFallback(result: unknown): result is { fallback: true; error: string } {
  return typeof result === "object" && result !== null && "fallback" in result && (result as { fallback?: boolean }).fallback === true;
}

async function storeTwilioCredentials(
  serviceClient: any,
  companyId: string,
  accountSid: string,
  authToken: string,
) {
  const validation = await validateTwilioCredentials(accountSid, authToken) as
    | { fallback: true; error: string }
    | { fallback: false; accountData: any; balance: number; balanceCurrency: string };

  if (isValidationFallback(validation)) {
    return validation;
  }

  const { accountData, balance, balanceCurrency } = validation;

  const { error } = await serviceClient
    .from("twilio_accounts")
    .upsert({
      company_id: companyId,
      account_sid: accountSid,
      auth_token: authToken,
      friendly_name: accountData.friendly_name,
      account_type: accountData.type,
      status: accountData.status,
      balance,
      balance_currency: balanceCurrency,
      last_balance_check: new Date().toISOString(),
    }, { onConflict: "company_id" });

  if (error) throw new Error(`DB error: ${error.message}`);

  return {
    success: true,
    account: {
      friendly_name: accountData.friendly_name,
      status: accountData.status,
      type: accountData.type,
      sid: accountSid.slice(0, 8) + "...",
    },
    balance,
    balance_currency: balanceCurrency,
  };
}

async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  maxAttempts = 4,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      lastErr = e;
      const transient = isTransientTwilioError(e);
      if (!transient || attempt === maxAttempts) break;
      const delay = 250 * Math.pow(2, attempt - 1) + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Override fetch for Twilio calls in this file
const _origFetch = fetch;
// @ts-ignore - replace global fetch references via wrapper
const twilioFetch = (url: string, init?: RequestInit) => fetchWithRetry(url, init);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let requestedAction: string | undefined;

  try {
    const body = await req.json();
    requestedAction = body?.action;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();
    if (!profile?.company_id) throw new Error("No company");

    const action = requestedAction;

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── ACTION: Save Twilio credentials ───
    if (action === "save-credentials") {
      const { accountSid, authToken } = body;
      if (!accountSid || !authToken) throw new Error("Missing accountSid or authToken");

      const result = await storeTwilioCredentials(serviceClient, profile.company_id, accountSid, authToken);
      return jsonResponse(result);
    }

    if (action === "connect-default") {
      const accountSid = Deno.env.get("TWILIO_SID");
      const authToken = Deno.env.get("TWILIO_TOKEN");
      if (!accountSid || !authToken) {
        throw new Error("Standard Twilio-forbindelse er ikke konfigureret endnu.");
      }

      const result = await storeTwilioCredentials(serviceClient, profile.company_id, accountSid, authToken);
      return jsonResponse({ ...result, connected_via: "platform" });
    }

    // ─── ACTION: Disconnect Twilio ───
    if (action === "disconnect") {
      await serviceClient
        .from("twilio_accounts")
        .delete()
        .eq("company_id", profile.company_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: Get Twilio account info (from DB + live API) ───
    if (action === "account-info") {
      const creds = await getTwilioCreds(serviceClient, profile.company_id);
      if (!creds) {
        return jsonResponse({ connected: false });
      }

      const { account_sid: twilioSid, auth_token: twilioToken } = creds;

       const accountCheck = await safeTwilioRequest(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}.json`,
        { headers: { Authorization: twilioAuth(twilioSid, twilioToken) } }
      );

      if (accountCheck.fallback) {
        return jsonResponse({
          connected: true,
          degraded: true,
          fallback: true,
          error: accountCheck.error,
          balance: creds.balance ?? 0,
          balance_currency: creds.balance_currency ?? "USD",
          phoneNumbers: [],
          usage: { count: 0, price: "0.00", usage_minutes: 0 },
          account: {
            sid: twilioSid.slice(0, 8) + "...",
            friendly_name: "Twilio",
            status: "unknown",
            type: "unknown",
          },
        });
      }

      const res = accountCheck.response!;

      if (!res.ok) {
        return jsonResponse({ connected: false, error: "Invalid credentials" });
      }

      const account = await res.json();

      // Get balance
      const balRes = await twilioFetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Balance.json`,
        { headers: { Authorization: twilioAuth(twilioSid, twilioToken) } }
      );
      let balance = 0;
      let balanceCurrency = "USD";
      if (balRes.ok) {
        const balData = await balRes.json();
        balance = parseFloat(balData.balance || "0");
        balanceCurrency = balData.currency || "USD";
      }

      // Update balance in DB
      await serviceClient
        .from("twilio_accounts")
        .update({ balance, balance_currency: balanceCurrency, last_balance_check: new Date().toISOString() })
        .eq("company_id", profile.company_id);

      // Get usage records for current month
      const now = new Date();
      const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const usageRes = await twilioFetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Usage/Records.json?Category=calls&StartDate=${startDate}`,
        { headers: { Authorization: twilioAuth(twilioSid, twilioToken) } }
      );

      let usage = { count: 0, price: "0.00", usage_minutes: 0 };
      if (usageRes.ok) {
        const usageData = await usageRes.json();
        const callRecord = usageData.usage_records?.[0];
        if (callRecord) {
          usage = {
            count: parseInt(callRecord.count || "0"),
            price: callRecord.price || "0.00",
            usage_minutes: parseInt(callRecord.usage || "0"),
          };
        }
      }

      // Get phone numbers
      const numbersRes = await twilioFetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json?PageSize=50`,
        { headers: { Authorization: twilioAuth(twilioSid, twilioToken) } }
      );

      let phoneNumbers: any[] = [];
      if (numbersRes.ok) {
        const numbersData = await numbersRes.json();
        phoneNumbers = (numbersData.incoming_phone_numbers || []).map((n: any) => ({
          sid: n.sid,
          phone_number: n.phone_number,
          friendly_name: n.friendly_name,
          capabilities: n.capabilities,
        }));

        await syncPhoneProvisionRecords(serviceClient, profile.company_id, phoneNumbers);
      }

      return new Response(JSON.stringify({
        connected: true,
        account: {
          friendly_name: account.friendly_name,
          status: account.status,
          type: account.type,
          sid: twilioSid.slice(0, 8) + "...",
        },
        balance,
        balance_currency: balanceCurrency,
        usage,
        phoneNumbers,
        noPhoneNumbers: phoneNumbers.length === 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: Start session ───
    if (action === "start-session") {
      const { data, error } = await supabase
        .from("cold_caller_usage")
        .insert({
          user_id: user.id,
          company_id: profile.company_id,
          session_started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new Error(`DB error: ${error.message}`);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: End session ───
    if (action === "end-session") {
      const { sessionId, calls_made, leads_created, duration_seconds } = body;
      const { error } = await serviceClient
        .from("cold_caller_usage")
        .update({
          session_ended_at: new Date().toISOString(),
          calls_made: calls_made || 0,
          leads_created: leads_created || 0,
          duration_seconds: duration_seconds || 0,
        })
        .eq("id", sessionId);

      if (error) throw new Error(`DB error: ${error.message}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: Make call via Twilio ───
    if (action === "make-call") {
      const creds = await getTwilioCreds(serviceClient, profile.company_id);
      if (!creds) throw new Error("Twilio ikke konfigureret. Gå til Konto-fanen for at forbinde.");

      const { account_sid: twilioSid, auth_token: twilioToken } = creds;

      // Check balance
      if (creds.balance !== null && creds.balance <= 0) {
        throw new Error("Din Twilio-saldo er 0. Tilføj kredit på twilio.com for at fortsætte med at ringe.");
      }

      const { to, from, leadId, leadName } = body;
      if (!to || !from) throw new Error("Missing 'to' or 'from' number");

      const callAttempt = await safeTwilioRequest(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`,
        {
          method: "POST",
          headers: {
            Authorization: twilioAuth(twilioSid, twilioToken),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: to,
            From: from,
            Url: `http://twimlets.com/holdmusic?Bucket=com.twilio.music.ambient`,
            StatusCallback: `${Deno.env.get("SUPABASE_URL")}/functions/v1/cold-caller`,
            StatusCallbackMethod: "POST",
            StatusCallbackEvent: "completed",
          }),
        }
      );

      if (callAttempt.fallback) {
        return jsonResponse({
          success: false,
          fallback: true,
          error: callAttempt.error,
        });
      }

      const callRes = callAttempt.response!;

      if (!callRes.ok) {
        const err = await callRes.text();
        throw new Error(`Twilio opkaldsfejl: ${err}`);
      }

      const callData = await callRes.json();

      return new Response(JSON.stringify({
        callSid: callData.sid,
        status: callData.status,
        to: callData.to,
        from: callData.from,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: Search available phone numbers ───
    if (action === "search-numbers") {
      const creds = await getTwilioCreds(serviceClient, profile.company_id);
      if (!creds) throw new Error("Twilio ikke konfigureret.");

      const { account_sid: twilioSid, auth_token: twilioToken } = creds;
      const { country = "US", areaCode, contains, numberType = "local" } = body;

      const params = new URLSearchParams({ PageSize: "20" });
      if (areaCode) params.set("AreaCode", areaCode);
      if (contains) params.set("Contains", contains);

      const tryEndpoints: string[] = [];
      const primary = numberType === "toll-free" ? "TollFree" : numberType === "mobile" ? "Mobile" : "Local";
      tryEndpoints.push(primary);
      // Auto-fallback chain when requested type isn't offered in the country (e.g. DK has no TollFree)
      for (const fb of ["Local", "Mobile", "TollFree"]) {
        if (!tryEndpoints.includes(fb)) tryEndpoints.push(fb);
      }

      let searchData: any = null;
      let usedEndpoint = primary;
      let lastErr = "";
      for (const ep of tryEndpoints) {
        const res = await twilioFetch(
          `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/AvailablePhoneNumbers/${country}/${ep}.json?${params}`,
          { headers: { Authorization: twilioAuth(twilioSid, twilioToken) } }
        );
        if (res.ok) {
          searchData = await res.json();
          usedEndpoint = ep;
          break;
        }
        lastErr = await res.text();
        // Only continue fallback on 404 (type not available in country)
        if (res.status !== 404) break;
      }

      if (!searchData) {
        return new Response(
          JSON.stringify({ numbers: [], warning: `Ingen numre tilgængelige i ${country}. ${lastErr ? "" : ""}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const numbers = (searchData.available_phone_numbers || []).map((n: any) => ({
        phone_number: n.phone_number,
        friendly_name: n.friendly_name,
        locality: n.locality,
        region: n.region,
        iso_country: n.iso_country,
        capabilities: n.capabilities,
        price: n.price || null,
      }));

      return new Response(JSON.stringify({ numbers, usedType: usedEndpoint }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: Buy a phone number ───
    if (action === "buy-number") {
      const creds = await getTwilioCreds(serviceClient, profile.company_id);
      if (!creds) throw new Error("Twilio ikke konfigureret.");

      const { account_sid: twilioSid, auth_token: twilioToken } = creds;
      const { phoneNumber, country } = body;
      if (!phoneNumber) throw new Error("Mangler telefonnummer");

      const buyRes = await twilioFetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json`,
        {
          method: "POST",
          headers: {
            Authorization: twilioAuth(twilioSid, twilioToken),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ PhoneNumber: phoneNumber }),
        }
      );

      if (!buyRes.ok) {
        const err = await buyRes.text();
        let parsed: any = null;

        try {
          parsed = JSON.parse(err);
        } catch {
          parsed = null;
        }

        if (parsed?.code === 21631) {
          const { data: company } = await serviceClient
            .from("companies")
            .select("address")
            .eq("id", profile.company_id)
            .single();

          const missingCompanyAddress = !company?.address;
          const addressHelp = missingCompanyAddress
            ? "Udfyld først virksomhedens adresse i Company Settings, og opret derefter en Regulatory Address i Twilio Console."
            : "Opret en Regulatory Address i Twilio Console og prøv derefter igen.";

          return jsonResponse({
            error: `Dette nummer i ${country || "det valgte land"} kræver adressevalidering hos Twilio. ${addressHelp}`,
            requiresAddress: true,
            twilioCode: parsed.code,
          });
        }

        return jsonResponse({
          error: `Kunne ikke købe nummer: ${parsed?.message || err}`,
          twilioCode: parsed?.code,
        });
      }

      const bought = await buyRes.json();
      await syncPhoneProvisionRecords(serviceClient, profile.company_id, [{ sid: bought.sid, phone_number: bought.phone_number }]);

      return new Response(JSON.stringify({
        success: true,
        phone_number: bought.phone_number,
        friendly_name: bought.friendly_name,
        sid: bought.sid,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: Release (delete) a phone number ───
    if (action === "release-number") {
      const creds = await getTwilioCreds(serviceClient, profile.company_id);
      if (!creds) throw new Error("Twilio ikke konfigureret.");

      const { account_sid: twilioSid, auth_token: twilioToken } = creds;
      const { numberSid } = body;
      if (!numberSid) throw new Error("Mangler nummer-SID");

      const releaseRes = await twilioFetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers/${numberSid}.json`,
        {
          method: "DELETE",
          headers: { Authorization: twilioAuth(twilioSid, twilioToken) },
        }
      );

      if (!releaseRes.ok) {
        const err = await releaseRes.text();
        throw new Error(`Kunne ikke frigive nummer: ${err}`);
      }

      await serviceClient
        .from("phone_provisions")
        .delete()
        .eq("company_id", profile.company_id)
        .eq("twilio_sid", numberSid);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: Get usage history ───
    if (action === "usage-history") {
      const { data, error } = await supabase
        .from("cold_caller_usage")
        .select("*")
        .eq("company_id", profile.company_id)
        .order("used_at", { ascending: false })
        .limit(50);

      if (error) throw new Error(`DB error: ${error.message}`);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    const message = getErrorMessage(e);
    const fallback = isTransientTwilioError(e);
    const authIssue = /missing auth|unauthorized|no company/i.test(message);

    if (authIssue && requestedAction === "account-info") {
      return jsonResponse({ connected: false, authRequired: true });
    }

    if (authIssue && requestedAction === "usage-history") {
      return jsonResponse([]);
    }

    return jsonResponse(
      { error: fallback ? "Twilio er midlertidigt utilgængelig. Prøv igen om et øjeblik." : message, fallback },
      fallback || authIssue ? 200 : 400,
    );
  }
});
