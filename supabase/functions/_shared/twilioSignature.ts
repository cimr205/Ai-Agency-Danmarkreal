// Verifies that an inbound request genuinely came from Twilio, per Twilio's
// documented request-validation algorithm: HMAC-SHA1 over the exact
// webhook URL with sorted POST-param key+value pairs appended, keyed by
// the account auth token, base64-encoded, compared to X-Twilio-Signature.
// https://www.twilio.com/docs/usage/security#validating-requests
//
// Used by the public (no-JWT) voice-agent-twiml/status/respond callbacks,
// which otherwise take a guessable call_id and trust the POST body as-is.

export interface TwilioVerification {
  valid: boolean;
  params: Record<string, string>;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function verifyTwilioRequest(req: Request): Promise<TwilioVerification> {
  const authToken = Deno.env.get("TWILIO_TOKEN");
  const signature = req.headers.get("X-Twilio-Signature") || "";

  const params: Record<string, string> = {};
  if (req.method === "POST") {
    try {
      const formData = await req.formData();
      formData.forEach((v, k) => { params[k] = String(v); });
    } catch {
      // Not form-encoded (or already consumed) — treat as no params.
    }
  }

  // Fail closed: an unconfigured auth token must never be treated as "skip verification".
  if (!authToken) return { valid: false, params };

  const sortedKeys = Object.keys(params).sort();
  let data = req.url;
  for (const key of sortedKeys) data += key + params[key];

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  return { valid: constantTimeEqual(expected, signature), params };
}
