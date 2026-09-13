// Meta Lead Ads webhook receiver.
//
// Meta subscribes a Page to the `leadgen` field (see meta-oauth-callback,
// which calls POST /{page_id}/subscribed_apps after connecting). Meta then
// POSTs a `page` webhook to this endpoint whenever a lead form is submitted:
// { object: "page", entry: [{ id: <page_id>, changes: [{ field: "leadgen",
// value: { leadgen_id, page_id, form_id, adgroup_id, ad_id, campaign_id } }] }] }
//
// GET is Meta's one-time subscription verification handshake
// (hub.mode/hub.verify_token/hub.challenge). POST is the actual event
// delivery, signed with X-Hub-Signature-256 over the raw body using the
// Meta App Secret.
//
// This function only resolves the page -> company and hands off to the
// ingest_meta_lead RPC (idempotent on Meta's leadgen id) for everything
// else — see supabase/migrations/20260912000003_meta_lead_ads.sql.
import { createClient } from 'npm:@supabase/supabase-js@2'

const GRAPH_API_VERSION = 'v19.0'

// Inlined from ../_shared/metaToken.ts (encryptMetaToken side, used by
// meta-oauth-start/meta-oauth-callback) — this deploy path does not resolve
// a relative import that climbs above the function's own directory, so the
// decrypt half is duplicated here rather than fought with bundler config.
// Any change to the encryption scheme must be mirrored in both places.
function metaTokenFromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function metaTokenEncryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('META_TOKEN_ENCRYPTION_KEY')
  if (!secret || secret.length < 32) throw new Error('META_TOKEN_ENCRYPTION_KEY must be at least 32 characters')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function decryptMetaToken(ciphertext: string, encodedIv: string): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: metaTokenFromBase64(encodedIv) }, await metaTokenEncryptionKey(), metaTokenFromBase64(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifySignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  const received = signatureHeader.replace(/^sha256=/i, '').toLowerCase()
  if (!received) return false
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const expected = bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))
  if (expected.length !== received.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ received.charCodeAt(i)
  return mismatch === 0
}

interface LeadgenChangeValue {
  leadgen_id: string
  page_id: string
  form_id?: string
  adgroup_id?: string
  ad_id?: string
  campaign_id?: string
  created_time?: number
}

interface GraphLeadField {
  name: string
  values: string[]
}

function extractField(fields: GraphLeadField[], candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const match = fields.find((f) => f.name.toLowerCase() === candidate)
    if (match?.values?.length) return match.values[0]
  }
  return undefined
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  // Meta's webhook subscription verification handshake.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const expected = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')
    if (mode === 'subscribe' && expected && token === expected && challenge) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const appSecret = Deno.env.get('META_APP_SECRET')
  const signature = req.headers.get('x-hub-signature-256') ?? ''
  const rawBody = await req.text()

  if (!appSecret || !signature || !(await verifySignature(rawBody, signature, appSecret))) {
    return new Response('Invalid signature', { status: 401 })
  }

  // Always ack quickly once the signature is valid — Meta disables a
  // subscription after repeated non-2xx/timeout responses. Per-lead failures
  // are recorded on meta_leadgen_events (status='failed') for retry/
  // investigation rather than surfaced as a webhook error.
  let payload: { object?: string; entry?: Array<{ id: string; changes?: Array<{ field: string; value: LeadgenChangeValue }> }> }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (payload.object !== 'page' || !Array.isArray(payload.entry)) {
    return new Response('ok', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue
      const value = change.value
      try {
        await processLeadgenChange(supabase, value)
      } catch (err) {
        console.error('meta-leadgen-webhook: failed to process leadgen change', value?.leadgen_id, err)
        // Swallow — already-idempotent via ingest_meta_lead's unique constraint,
        // so a retried delivery (Meta retries on non-2xx) is safe, but we don't
        // want one bad lead to fail the whole batch's 200 response.
      }
    }
  }

  return new Response('ok', { status: 200 })
})

async function processLeadgenChange(
  supabase: ReturnType<typeof createClient>,
  value: LeadgenChangeValue,
) {
  const { data: page } = await supabase
    .from('meta_pages')
    .select('page_access_token_ciphertext, page_token_iv')
    .eq('page_id', value.page_id)
    .maybeSingle()

  let name: string | undefined
  let email: string | undefined
  let phone: string | undefined
  let raw: unknown = {}

  if (page?.page_access_token_ciphertext && page.page_token_iv) {
    const pageToken = await decryptMetaToken(page.page_access_token_ciphertext, page.page_token_iv)
    const graphRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${value.leadgen_id}?access_token=${encodeURIComponent(pageToken)}`,
    )
    if (graphRes.ok) {
      const leadData = await graphRes.json()
      raw = leadData
      const fields: GraphLeadField[] = leadData.field_data ?? []
      name = extractField(fields, ['full_name', 'name'])
      email = extractField(fields, ['email'])
      phone = extractField(fields, ['phone_number', 'phone'])
    } else {
      console.error('meta-leadgen-webhook: Graph API lead fetch failed', value.leadgen_id, await graphRes.text())
    }
  }
  // If the page isn't matched or the token/fetch fails, we still call
  // ingest_meta_lead below with whatever we have (possibly no name/email/
  // phone) — it records the raw webhook value and, if the page truly isn't
  // matched to a company, marks the event 'skipped_unmatched_page' rather
  // than silently dropping it. This is the "missing optional campaign
  // metadata" / "retry after partial failure" case: the event row persists
  // for reprocessing once the page is connected or the Graph fetch is fixed.

  const { error } = await supabase.rpc('ingest_meta_lead', {
    p_meta_leadgen_id: value.leadgen_id,
    p_meta_page_id: value.page_id,
    p_meta_form_id: value.form_id ?? null,
    p_meta_ad_id: value.ad_id ?? null,
    p_meta_adset_id: value.adgroup_id ?? null,
    p_meta_campaign_id: value.campaign_id ?? null,
    p_name: name ?? null,
    p_email: email ?? null,
    p_phone: phone ?? null,
    p_raw: raw,
  })
  if (error) throw error
}
