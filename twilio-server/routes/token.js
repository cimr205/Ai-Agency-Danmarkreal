'use strict';

/**
 * GET /token
 * ──────────────────────────────────────────────────────────────────────────
 * Multi-tenant Twilio Access Token endpoint.
 *
 * Priority:
 *   1. Accept the user's JWT (Authorization header or ?jwt= query param)
 *   2. Call Railway API → /v1/phone/twilio-settings  to get THIS company's
 *      Twilio credentials (account_sid / api_key / api_secret / twiml_app_sid)
 *   3. Fall back to .env credentials when no company-specific creds are found
 *      (useful for self-hosting or single-tenant deployments)
 *
 * Token identity:
 *   - From ?identity= query param
 *   - Or: derived from Railway API user (user_id or email)
 *   - Sanitised to Twilio-safe characters
 *
 * Required env vars (fallback / single-tenant):
 *   TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_TWIML_APP_SID
 *
 * Optional env vars (multi-tenant):
 *   RAILWAY_API_URL   — base URL of the Railway API
 *                       default: https://api.aiagencydanmark.dk/api
 * ──────────────────────────────────────────────────────────────────────────
 */

const express = require('express');
const twilio  = require('twilio');

const router      = express.Router();
const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant  = AccessToken.VoiceGrant;

const RAILWAY_API = process.env.RAILWAY_API_URL ?? 'https://api.aiagencydanmark.dk/api';

// ─── Main handler ────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  // 1. Extract JWT from the request
  const jwt = extractJwt(req);

  // 2. Try to load per-company Twilio credentials
  let creds = null;
  if (jwt) {
    creds = await fetchCompanyCreds(jwt);
  }

  // 3. Fall back to env-var credentials (single-tenant / self-hosted)
  if (!creds) {
    const {
      TWILIO_ACCOUNT_SID,
      TWILIO_API_KEY,
      TWILIO_API_SECRET,
      TWILIO_TWIML_APP_SID,
    } = process.env;

    if (TWILIO_ACCOUNT_SID && TWILIO_API_KEY && TWILIO_API_SECRET && TWILIO_TWIML_APP_SID) {
      creds = {
        account_sid:   TWILIO_ACCOUNT_SID,
        api_key:       TWILIO_API_KEY,
        api_secret:    TWILIO_API_SECRET,
        twiml_app_sid: TWILIO_TWIML_APP_SID,
        identity:      null,              // will be set below
      };
    } else {
      console.error('[/token] No Twilio credentials available (env or company settings).');
      return res.status(500).json({
        error: [
          'No Twilio credentials found.',
          'Either: (a) Set TWILIO_* env vars for single-tenant mode,',
          'or (b) Configure Twilio credentials in your company settings.',
        ].join(' '),
      });
    }
  }

  // 4. Build identity
  //    Priority: ?identity=  >  company identity from API  >  "browser-user"
  const rawIdentity  = req.query.identity ?? creds.identity ?? 'browser-user';
  const identity     = sanitiseIdentity(String(rawIdentity));

  // 5. Issue Twilio Access Token
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: creds.twiml_app_sid,
    incomingAllow: true,
  });

  const token = new AccessToken(
    creds.account_sid,
    creds.api_key,
    creds.api_secret,
    { identity, ttl: 3600 },
  );
  token.addGrant(voiceGrant);

  console.log(`[/token] Issued  identity="${identity}"  acct="${creds.account_sid.slice(0, 8)}…"  source="${creds._source ?? 'env'}"`);

  res.json({
    token:    token.toJwt(),
    identity,
    expires:  new Date(Date.now() + 3600 * 1000).toISOString(),
    account:  creds.account_sid,      // useful for debugging
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract bearer JWT from:
 *   Authorization: Bearer <jwt>
 *   ?jwt=<jwt>  (for environments where setting headers is awkward)
 */
function extractJwt(req) {
  const header = req.headers.authorization ?? '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (req.query.jwt) return String(req.query.jwt);
  return null;
}

/**
 * Call the Railway API to get the company's Twilio credentials.
 * Returns { account_sid, api_key, api_secret, twiml_app_sid, identity, _source }
 * or null if the request fails or credentials are not configured.
 */
async function fetchCompanyCreds(jwt) {
  const url = `${RAILWAY_API}/v1/phone/twilio-settings`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000),   // don't block the response for long
    });

    if (!res.ok) {
      // 404 = endpoint not implemented yet on Railway API → use env fallback
      if (res.status !== 404) {
        console.warn(`[/token] Railway API returned ${res.status} for Twilio settings`);
      }
      return null;
    }

    const data = await res.json();

    // Validate that the response has the required fields
    if (!data.account_sid || !data.api_key || !data.api_secret || !data.twiml_app_sid) {
      console.warn('[/token] Railway API returned incomplete Twilio settings');
      return null;
    }

    return {
      account_sid:   data.account_sid,
      api_key:       data.api_key,
      api_secret:    data.api_secret,
      twiml_app_sid: data.twiml_app_sid,
      identity:      data.identity ?? null,
      _source:       'company-settings',
    };
  } catch (err) {
    console.warn('[/token] Failed to fetch company Twilio creds:', err.message);
    return null;
  }
}

/**
 * Twilio identity must contain only letters, digits, dashes, underscores.
 * Max 121 characters.
 */
function sanitiseIdentity(raw) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 121);
}

module.exports = router;
