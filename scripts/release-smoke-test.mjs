import { createHmac } from 'node:crypto';

const required = [
  'SMOKE_SUPABASE_URL',
  'SMOKE_SUPABASE_ANON_KEY',
  'SMOKE_USER_JWT',
  'SMOKE_META_APP_SECRET',
  'SMOKE_STRIPE_WEBHOOK_SECRET',
  'SMOKE_WORKFLOW_DRAIN_SECRET',
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing smoke-test variables: ${missing.join(', ')}`);

const base = process.env.SMOKE_SUPABASE_URL.replace(/\/$/, '');
const functions = `${base}/functions/v1`;
const anon = process.env.SMOKE_SUPABASE_ANON_KEY;
const userJwt = process.env.SMOKE_USER_JWT;

async function request(name, url, init, accepted) {
  const response = await fetch(url, { redirect: 'manual', ...init });
  const body = await response.text();
  if (!accepted.includes(response.status)) {
    throw new Error(`${name}: HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  console.log(`PASS ${name} (${response.status})`);
  return { response, body };
}

// Gateway reachability and fail-closed scheduler authentication.
await request('workflow drain rejects unauthenticated request', `${functions}/workflow-runner`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'drain', limit: 1 }),
}, [401, 403]);
await request('workflow drain rejects wrong secret', `${functions}/workflow-runner`, {
  method: 'POST', headers: { authorization: 'Bearer deliberately-wrong', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'drain', limit: 1 }),
}, [403]);

if (process.env.SMOKE_RUN_DRAIN === '1') {
  await request('authorized workflow drain', `${functions}/workflow-runner`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.SMOKE_WORKFLOW_DRAIN_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'drain', worker_id: `release-smoke-${Date.now()}`, limit: 1 }),
  }, [200]);
} else {
  console.log('SKIP authorized drain (set SMOKE_RUN_DRAIN=1 in controlled staging)');
}

// Valid signatures with provider no-op event types exercise deployed parsers
// without creating leads, invoices or payments.
const metaBody = JSON.stringify({ object: 'page', entry: [] });
const metaSignature = `sha256=${createHmac('sha256', process.env.SMOKE_META_APP_SECRET).update(metaBody).digest('hex')}`;
await request('Meta signed no-op webhook', `${functions}/meta-lead-webhook`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': metaSignature }, body: metaBody,
}, [200]);

const stripeBody = JSON.stringify({ id: `evt_release_smoke_${Date.now()}`, object: 'event', type: 'release.smoke', data: { object: {} } });
const timestamp = Math.floor(Date.now() / 1000);
const stripeSignature = createHmac('sha256', process.env.SMOKE_STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${stripeBody}`).digest('hex');
await request('Stripe signed no-op webhook', `${functions}/stripe-payment-webhook`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${stripeSignature}` }, body: stripeBody,
}, [200]);

// Create a real server-side Gmail state, consume it with a deliberately invalid
// provider code, then prove replay is rejected before another token exchange.
const gmailStart = await request('Gmail OAuth state creation', `${functions}/gmail-auth`, {
  method: 'POST', headers: { authorization: `Bearer ${userJwt}`, apikey: anon, 'content-type': 'application/json' }, body: '{}',
}, [200]);
const authUrl = new URL(JSON.parse(gmailStart.body).auth_url);
const state = authUrl.searchParams.get('state');
if (!state || !/^[0-9a-f-]{36}$/i.test(state)) throw new Error('Gmail OAuth state is not opaque UUID state');
await request('Gmail OAuth state first consumption', `${functions}/gmail-oauth-callback?code=release-smoke-invalid-code&state=${encodeURIComponent(state)}`, {}, [302]);
const replay = await request('Gmail OAuth state replay rejection', `${functions}/gmail-oauth-callback?code=release-smoke-invalid-code&state=${encodeURIComponent(state)}`, {}, [302]);
if (!replay.response.headers.get('location')?.includes('Invalid%20or%20expired%20OAuth%20state')) {
  throw new Error('Gmail OAuth replay was not rejected as invalid/expired state');
}

await request('tenant-scoped authenticated read', `${base}/rest/v1/profiles?select=company_id&limit=1`, {
  headers: { authorization: `Bearer ${userJwt}`, apikey: anon },
}, [200]);

if (process.env.SMOKE_WORKFLOW_ID) {
  await request('safe workflow test execution', `${functions}/workflow-runner`, {
    method: 'POST',
    headers: { authorization: `Bearer ${userJwt}`, apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ workflow_id: process.env.SMOKE_WORKFLOW_ID, mode: 'test', payload: { release_smoke: true } }),
  }, [200]);
} else {
  console.log('SKIP workflow test execution (set SMOKE_WORKFLOW_ID to a staging workflow)');
}

console.log('Release smoke test completed successfully.');
