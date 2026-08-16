'use strict';

/**
 * Twilio Voice TwiML routes — multi-tenant
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  POST /voice/outgoing[?company_id=<id>]
 *    TwiML App "Voice Request URL".
 *    The browser SDK sends { To: "+45..." } in the POST body.
 *    Uses the company's provisioned callerId when company_id is present.
 *
 *  POST /voice/incoming[?company_id=<id>]
 *    Set as the "A Call Comes In" webhook on each provisioned Twilio number.
 *    Routes the call to the correct company's browser agent.
 *
 *  How to make incoming calls multi-tenant:
 *    When a company provisions a phone number, set its webhook to:
 *      https://<your-server>/voice/incoming?company_id=<company_id>
 *    The twilio-server then knows which company's browser client to ring.
 * ──────────────────────────────────────────────────────────────────────────
 */

const express = require('express');
const twilio  = require('twilio');

const router        = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

const RAILWAY_API = process.env.RAILWAY_API_URL ?? 'https://api.aiagencydanmark.dk/api';

// ─── POST /voice/outgoing ────────────────────────────────────────────────────

router.post('/outgoing', async (req, res) => {
  const { To }        = req.body;
  const company_id    = req.query.company_id ?? null;
  const twiml         = new VoiceResponse();

  if (!To) {
    twiml.say({ voice: 'alice' }, 'No destination number was provided. Goodbye.');
    return res.type('text/xml').send(twiml.toString());
  }

  if (!isValidPhoneNumber(To) && !isClientIdentity(To)) {
    console.warn(`[/voice/outgoing] Rejected invalid To="${To}"  company="${company_id}"`);
    twiml.say({ voice: 'alice' }, 'The provided number is not valid. Goodbye.');
    return res.type('text/xml').send(twiml.toString());
  }

  // Resolve caller ID: company's provisioned number > env fallback
  const callerId = await resolveCallerId(company_id) ?? process.env.TWILIO_PHONE_NUMBER;

  console.log(`[/voice/outgoing] To="${To}"  callerId="${callerId}"  company="${company_id ?? 'default'}"`);

  const dial = twiml.dial({
    callerId,
    record:         'do-not-record',    // change to 'record-from-answer' to enable
    timeout:        30,
    answerOnBridge: true,
  });

  if (isClientIdentity(To)) {
    dial.client(To.replace(/^client:/, ''));
  } else {
    dial.number(To);
  }

  res.type('text/xml').send(twiml.toString());
});

// ─── POST /voice/incoming ────────────────────────────────────────────────────

router.post('/incoming', async (req, res) => {
  const { From, To, CallSid } = req.body;
  const company_id = req.query.company_id ?? null;
  const twiml      = new VoiceResponse();

  console.log(`[/voice/incoming] CallSid=${CallSid}  From="${From}"  To="${To}"  company="${company_id ?? 'default'}"`);

  // Greeting (customise or remove as needed)
  twiml.say({ voice: 'alice', language: 'da-DK' },
    'Tak for dit opkald. Vent venligst mens vi forbinder dig.',
  );

  // Resolve which agent identity to ring.
  // Multi-tenant: look up the on-duty agent for this company.
  // Single-tenant: use "browser-user" as a fallback.
  const agentIdentity = await resolveAgentIdentity(company_id, From);

  console.log(`[/voice/incoming] Routing to agent: "${agentIdentity}"`);

  const dial = twiml.dial({ timeout: 20, hangupOnStar: true });
  dial.client(agentIdentity);

  res.type('text/xml').send(twiml.toString());
});

// ─── POST /voice/call  (REST-API triggered outbound call) ────────────────────

router.post('/call', async (req, res) => {
  const { to, from, company_id } = req.body;

  if (!to || !isValidPhoneNumber(to)) {
    return res.status(400).json({
      error: 'Missing or invalid "to" (E.164 format required, e.g. +4512345678)',
    });
  }

  let account_sid, auth_token, phone_number;

  if (company_id) {
    const creds = await fetchCompanyRestCreds(company_id);
    if (creds) {
      account_sid  = creds.account_sid;
      auth_token   = creds.auth_token;
      phone_number = creds.phone_number;
    }
  }

  // Fall back to env vars
  account_sid  ??= process.env.TWILIO_ACCOUNT_SID;
  auth_token   ??= process.env.TWILIO_AUTH_TOKEN;
  phone_number ??= process.env.TWILIO_PHONE_NUMBER;

  if (!account_sid || !auth_token) {
    return res.status(500).json({ error: 'Twilio REST credentials not configured' });
  }

  const client = twilio(account_sid, auth_token);
  const baseUrl = process.env.SERVER_URL ?? 'http://localhost:3001';

  try {
    const call = await client.calls.create({
      to,
      from:  from ?? phone_number,
      url:   `${baseUrl}/voice/outgoing${company_id ? `?company_id=${company_id}` : ''}`,
      method: 'POST',
    });

    console.log(`[/voice/call] Initiated  sid=${call.sid}  to="${to}"  company="${company_id ?? 'default'}"`);
    res.json({ ok: true, sid: call.sid, status: call.status });
  } catch (err) {
    console.error('[/voice/call] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the callerId for an outbound call.
 * Tries Railway API /v1/phone/provision for this company first, then env var.
 */
async function resolveCallerId(company_id) {
  if (!company_id || !RAILWAY_API) return null;
  try {
    const res = await fetch(`${RAILWAY_API}/v1/phone/provision`, {
      headers: { 'x-company-id': company_id },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.phone_number ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve which browser-client identity should receive an incoming call.
 * Extend this to look up on-duty agents from your own database.
 *
 * Currently returns: "browser-user-<company_id>" or "browser-user"
 *
 * TODO: query your API for the agent who is currently logged in / on duty
 *       e.g. GET /v1/phone/on-duty-agent?company_id=<id>
 */
async function resolveAgentIdentity(company_id, _from) {
  if (company_id) return `browser-user-${company_id}`;
  return 'browser-user';
}

/**
 * Fetch REST API credentials (account_sid + auth_token) for a company.
 * Only needed for server-side call initiation (/voice/call endpoint).
 */
async function fetchCompanyRestCreds(company_id) {
  if (!RAILWAY_API) return null;
  try {
    const res = await fetch(`${RAILWAY_API}/v1/admin/phone/${company_id}/twilio-creds`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function isValidPhoneNumber(n) {
  return typeof n === 'string' && /^\+[1-9]\d{7,14}$/.test(n);
}

function isClientIdentity(n) {
  return typeof n === 'string' && n.startsWith('client:');
}

module.exports = router;
