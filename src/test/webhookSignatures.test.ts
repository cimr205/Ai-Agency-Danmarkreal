import { describe, it, expect } from 'vitest';

// Mirrors verifySignature() in supabase/functions/meta-leadgen-webhook/index.ts
// verbatim — that file is Deno-only (no shared src/ module boundary between
// the frontend build and edge functions), so this is a deliberate copy, not
// an import. Keep it in sync if the real function changes. This exercises
// real HMAC-SHA256 (Node's Web Crypto, not mocked) against Meta's
// X-Hub-Signature-256 scheme: sha256=<hex hmac of the raw body>.
function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyMetaSignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  const received = signatureHeader.replace(/^sha256=/i, '').toLowerCase();
  if (!received) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const expected = bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  if (expected.length !== received.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return mismatch === 0;
}

async function signMeta(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  return `sha256=${sig}`;
}

describe('Meta Lead Ads webhook signature verification', () => {
  const secret = 'test-meta-app-secret';
  const payload = JSON.stringify({
    object: 'page',
    entry: [{ id: '123456789', changes: [{ field: 'leadgen', value: { leadgen_id: 'lead_1', page_id: '123456789' } }] }],
  });

  it('accepts a correctly signed payload', async () => {
    const signature = await signMeta(payload, secret);
    expect(await verifyMetaSignature(payload, signature, secret)).toBe(true);
  });

  it('rejects a tampered payload with the original signature', async () => {
    const signature = await signMeta(payload, secret);
    const tampered = payload.replace('lead_1', 'lead_evil');
    expect(await verifyMetaSignature(tampered, signature, secret)).toBe(false);
  });

  it('rejects a signature produced with the wrong secret', async () => {
    const signature = await signMeta(payload, 'wrong-secret');
    expect(await verifyMetaSignature(payload, signature, secret)).toBe(false);
  });

  it('rejects a missing/empty signature header', async () => {
    expect(await verifyMetaSignature(payload, '', secret)).toBe(false);
  });

  it('rejects a malformed signature header (not hex, wrong length)', async () => {
    expect(await verifyMetaSignature(payload, 'sha256=not-a-real-signature', secret)).toBe(false);
  });
});

// Stripe's actual signature verification (supabase/functions/stripe-webhook)
// delegates entirely to the real `stripe` SDK's stripe.webhooks.constructEventAsync,
// which is not a project dependency here (only pulled in via esm.sh inside
// the Deno edge function) — adding it as an npm devDependency just to
// re-test a third-party SDK's own, already-tested algorithm was judged out
// of scope. This documents and exercises Stripe's public, documented
// signing scheme (HMAC-SHA256 of "${timestamp}.${payload}", header
// "t=<ts>,v1=<hex>") as a standalone algorithm check — it does NOT execute
// the deployed stripe-webhook code path. See the final report's fixture
// verification tier for what this test does and does not prove.
async function signStripeLike(rawBody: string, secret: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signedPayload = `${timestamp}.${rawBody}`;
  const sig = bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload)));
  return `t=${timestamp},v1=${sig}`;
}

async function verifyStripeLike(rawBody: string, header: string, secret: string, toleranceSeconds = 300): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const timestamp = Number(parts.t);
  const v1 = parts.v1;
  if (!timestamp || !v1) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expectedHeader = await signStripeLike(rawBody, secret, timestamp);
  const expectedV1 = expectedHeader.split('v1=')[1];
  if (expectedV1.length !== v1.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expectedV1.length; i++) mismatch |= expectedV1.charCodeAt(i) ^ v1.charCodeAt(i);
  return mismatch === 0;
}

describe('Stripe webhook signing scheme (algorithm-level, not the deployed SDK call)', () => {
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', metadata: { payment_reference: 'ref-1' } } } });

  it('accepts a correctly signed, fresh payload', async () => {
    const header = await signStripeLike(payload, secret, Math.floor(Date.now() / 1000));
    expect(await verifyStripeLike(payload, header, secret)).toBe(true);
  });

  it('rejects a tampered payload', async () => {
    const header = await signStripeLike(payload, secret, Math.floor(Date.now() / 1000));
    const tampered = payload.replace('ref-1', 'ref-evil');
    expect(await verifyStripeLike(tampered, header, secret)).toBe(false);
  });

  it('rejects a signature signed with the wrong secret', async () => {
    const header = await signStripeLike(payload, 'wrong-secret', Math.floor(Date.now() / 1000));
    expect(await verifyStripeLike(payload, header, secret)).toBe(false);
  });

  it('rejects a stale timestamp outside tolerance (replay protection)', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const header = await signStripeLike(payload, secret, staleTimestamp);
    expect(await verifyStripeLike(payload, header, secret)).toBe(false);
  });
});
