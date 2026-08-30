import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCompanyAuth } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface TwilioCredentials {
  account_sid: string;
  auth_token: string | null;
  api_key_sid: string | null;
  api_key_secret: string | null;
  balance: number | null;
  balance_currency: string | null;
}

interface TwilioPhoneNumber {
  sid?: string;
  phone_number?: string;
  friendly_name?: string;
  capabilities?: Record<string, boolean>;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isTransientTwilioError(error: unknown) {
  return /reset by peer|ECONNRESET|connection closed|connection refused|network|timed? ?out|EOF|os error 104|os error 32/i
    .test(errorMessage(error));
}

function twilioAuth(credentials: TwilioCredentials) {
  const username = credentials.api_key_sid || credentials.account_sid;
  const password = credentials.api_key_secret || credentials.auth_token || "";
  return `Basic ${btoa(`${username}:${password}`)}`;
}

async function fetchWithRetry(url: string, init?: RequestInit, maxAttempts = 4) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (!isTransientTwilioError(error) || attempt === maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }

  throw lastError;
}

async function getCredentials(serviceClient: SupabaseClient, companyId: string) {
  const { data, error } = await serviceClient
    .from("twilio_accounts")
    .select("account_sid, auth_token, api_key_sid, api_key_secret, balance, balance_currency")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw new Error(`DB error: ${error.message}`);
  return data as TwilioCredentials | null;
}

async function syncPhoneProvisions(
  serviceClient: SupabaseClient,
  companyId: string,
  phoneNumbers: TwilioPhoneNumber[],
) {
  const validNumbers = phoneNumbers.filter((number) => number.sid && number.phone_number);
  if (validNumbers.length === 0) return;

  const sids = validNumbers.map((number) => number.sid as string);
  const { data: existing, error: readError } = await serviceClient
    .from("phone_provisions")
    .select("twilio_sid")
    .eq("company_id", companyId)
    .in("twilio_sid", sids);

  if (readError) {
    console.error("voice-telephony phone provision lookup failed", readError);
    return;
  }

  const existingSids = new Set(
    (existing || []).map((record: { twilio_sid: string | null }) => record.twilio_sid),
  );
  const missing = validNumbers
    .filter((number) => !existingSids.has(number.sid as string))
    .map((number) => ({
      company_id: companyId,
      phone_number: number.phone_number as string,
      twilio_sid: number.sid as string,
    }));

  if (missing.length === 0) return;
  const { error } = await serviceClient.from("phone_provisions").insert(missing);
  if (error) console.error("voice-telephony phone provision sync failed", error);
}

async function connectPlatformAccount(serviceClient: SupabaseClient, companyId: string) {
  const accountSid = Deno.env.get("TWILIO_SID");
  const authToken = Deno.env.get("TWILIO_TOKEN");

  if (!accountSid || !authToken) {
    throw new Error("Standard Twilio-forbindelse er ikke konfigureret endnu.");
  }

  const credentials: TwilioCredentials = {
    account_sid: accountSid,
    auth_token: authToken,
    api_key_sid: null,
    api_key_secret: null,
    balance: null,
    balance_currency: null,
  };
  const response = await fetchWithRetry(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
    { headers: { Authorization: twilioAuth(credentials) } },
  );

  if (!response.ok) {
    throw new Error("Platformens Twilio-forbindelse kunne ikke valideres.");
  }

  const account = await response.json();
  const { error } = await serviceClient.from("twilio_accounts").upsert(
    {
      company_id: companyId,
      account_sid: accountSid,
      auth_token: authToken,
      api_key_sid: null,
      api_key_secret: null,
      friendly_name: account.friendly_name,
      account_type: account.type,
      status: account.status,
    },
    { onConflict: "company_id" },
  );

  if (error) throw new Error(`DB error: ${error.message}`);
  return jsonResponse({ success: true, connected_via: "platform" });
}

async function getAccountInfo(serviceClient: SupabaseClient, companyId: string) {
  const credentials = await getCredentials(serviceClient, companyId);
  if (!credentials) return jsonResponse({ connected: false });

  const authorization = twilioAuth(credentials);

  try {
    const [accountResponse, balanceResponse, usageResponse, numbersResponse] = await Promise.all([
      fetchWithRetry(`https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}.json`, {
        headers: { Authorization: authorization },
      }),
      fetchWithRetry(`https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/Balance.json`, {
        headers: { Authorization: authorization },
      }),
      fetchWithRetry(
        `https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/Usage/Records.json?Category=calls&StartDate=${new Date().toISOString().slice(0, 7)}-01`,
        { headers: { Authorization: authorization } },
      ),
      fetchWithRetry(
        `https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/IncomingPhoneNumbers.json?PageSize=50`,
        { headers: { Authorization: authorization } },
      ),
    ]);

    if (!accountResponse.ok) {
      return jsonResponse({ connected: false, error: "Invalid credentials" });
    }

    const account = await accountResponse.json();
    const balanceData = balanceResponse.ok ? await balanceResponse.json() : {};
    const balance = Number.parseFloat(balanceData.balance || "0");
    const balanceCurrency = balanceData.currency || "USD";
    const usageData = usageResponse.ok ? await usageResponse.json() : {};
    const callUsage = usageData.usage_records?.[0];
    const numberData = numbersResponse.ok ? await numbersResponse.json() : {};
    const phoneNumbers = (numberData.incoming_phone_numbers || []).map((number: TwilioPhoneNumber) => ({
      sid: number.sid,
      phone_number: number.phone_number,
      friendly_name: number.friendly_name,
      capabilities: number.capabilities,
    }));

    await Promise.all([
      serviceClient
        .from("twilio_accounts")
        .update({
          balance,
          balance_currency: balanceCurrency,
          last_balance_check: new Date().toISOString(),
        })
        .eq("company_id", companyId),
      syncPhoneProvisions(serviceClient, companyId, phoneNumbers),
    ]);

    return jsonResponse({
      connected: true,
      account: {
        friendly_name: account.friendly_name,
        status: account.status,
        type: account.type,
        sid: `${credentials.account_sid.slice(0, 8)}...`,
      },
      balance,
      balance_currency: balanceCurrency,
      usage: {
        count: Number.parseInt(callUsage?.count || "0", 10),
        price: callUsage?.price || "0.00",
        usage_minutes: Number.parseInt(callUsage?.usage || "0", 10),
      },
      phoneNumbers,
      noPhoneNumbers: phoneNumbers.length === 0,
    });
  } catch (error) {
    if (!isTransientTwilioError(error)) throw error;

    return jsonResponse({
      connected: true,
      degraded: true,
      fallback: true,
      error: "Twilio er midlertidigt utilgængelig. Prøv igen om et øjeblik.",
      balance: credentials.balance ?? 0,
      balance_currency: credentials.balance_currency ?? "USD",
      usage: { count: 0, price: "0.00", usage_minutes: 0 },
      phoneNumbers: [],
      account: {
        friendly_name: "Twilio",
        status: "unknown",
        type: "unknown",
        sid: `${credentials.account_sid.slice(0, 8)}...`,
      },
    });
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await request.json();
    const context = await requireCompanyAuth(request);
    if (context instanceof Response) return context;

    if (action === "connect-default") {
      return await connectPlatformAccount(context.supabase, context.companyId);
    }
    if (action === "account-info") {
      return await getAccountInfo(context.supabase, context.companyId);
    }

    return jsonResponse({ error: `Unknown action: ${String(action)}` }, 400);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
});
