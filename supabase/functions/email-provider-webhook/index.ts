import { createClient } from 'npm:@supabase/supabase-js@2'

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const expected = bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))
  const received = signature.replace(/^sha256=/i, '').toLowerCase()
  if (expected.length !== received.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ received.charCodeAt(i)
  return mismatch === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const secret = Deno.env.get('EMAIL_WEBHOOK_SECRET')
  const signature = req.headers.get('x-webhook-signature') ?? ''
  const rawBody = await req.text()
  if (!secret || !signature || !(await verifySignature(rawBody, signature, secret))) {
    return new Response('Invalid signature', { status: 401 })
  }

  const event = JSON.parse(rawBody) as {
    id: string
    company_id: string
    message_id: string
    type: string
    occurred_at?: string
    data?: Record<string, unknown>
  }
  if (!event.id || !event.company_id || !event.message_id || !event.type) {
    return new Response('Invalid event', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data, error } = await supabase.rpc('record_email_delivery_event', {
    p_company_id: event.company_id,
    p_provider_event_id: event.id,
    p_provider_message_id: event.message_id,
    p_event_type: event.type,
    p_payload: event.data ?? {},
    p_occurred_at: event.occurred_at ?? new Date().toISOString(),
  })
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
})
