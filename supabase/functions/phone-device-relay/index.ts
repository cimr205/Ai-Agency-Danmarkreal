import { createClient } from 'npm:@supabase/supabase-js@2'

type RelayRequest = {
  action?: 'claim' | 'heartbeat' | 'poll' | 'event'
  pairing_session_id?: string
  pairing_secret?: string
  short_code?: string
  display_name?: string
  platform?: 'ios' | 'android'
  os_version?: string
  app_version?: string
  capabilities?: Record<string, unknown>
  command_id?: string
  event_id?: string
  event_type?: string
  payload?: Record<string, unknown>
  occurred_at?: string
}

type PairingSession = {
  id: string
  company_id: string
  user_id: string
  attempts: number
  pairing_secret_hash: string
  short_code_hash: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

function randomToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)).buffer)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const body = await req.json().catch(() => ({})) as RelayRequest
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  if (body.action === 'claim') {
    if ((!body.pairing_session_id && !body.short_code) || !body.platform || !body.display_name) return json({ error: 'Invalid claim request' }, 400)
    let session: PairingSession | null = null
    if (body.pairing_session_id) {
      const { data } = await supabase.from('phone_pairing_sessions').select('*')
        .eq('id', body.pairing_session_id).is('claimed_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
      session = data
    } else if (body.short_code) {
      const rateKey = await sha256(`${req.headers.get('x-forwarded-for') ?? 'unknown'}:${req.headers.get('user-agent') ?? 'unknown'}`)
      const { data: allowed } = await supabase.rpc('consume_phone_pairing_attempt', { p_key_hash: rateKey })
      if (!allowed) return json({ error: 'Too many pairing attempts. Try again later.' }, 429)
      const { data } = await supabase.from('phone_pairing_sessions').select('*')
        .eq('short_code_hash', await sha256(body.short_code)).is('claimed_at', null)
        .gt('expires_at', new Date().toISOString()).limit(2)
      if (data?.length === 1) session = data[0]
    }
    if (!session || session.attempts >= 10) return json({ error: 'Pairing session is invalid or expired' }, 400)

    const suppliedHash = body.pairing_secret
      ? await sha256(body.pairing_secret)
      : body.short_code ? await sha256(body.short_code) : ''
    const expectedHash = body.pairing_secret ? session.pairing_secret_hash : session.short_code_hash
    if (!suppliedHash || !constantTimeEqual(suppliedHash, expectedHash)) {
      await supabase.from('phone_pairing_sessions').update({ attempts: session.attempts + 1 }).eq('id', session.id)
      return json({ error: 'Pairing credentials are invalid' }, 401)
    }

    const rawToken = randomToken()
    const deviceId = crypto.randomUUID()
    const { error: insertError } = await supabase.from('phone_devices').insert({
      id: deviceId, company_id: session.company_id, user_id: session.user_id,
      display_name: body.display_name.slice(0, 120), platform: body.platform,
      os_version: body.os_version?.slice(0, 80), app_version: body.app_version?.slice(0, 80),
      capabilities: body.capabilities ?? {}, device_token_hash: await sha256(rawToken),
      status: 'online', last_heartbeat_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    })
    if (insertError) return json({ error: 'Unable to create device', detail: insertError.message }, 500)
    const { data: claimed } = await supabase.from('phone_pairing_sessions').update({
      claimed_at: new Date().toISOString(), device_id: deviceId,
    }).eq('id', session.id).is('claimed_at', null).select('id').maybeSingle()
    if (!claimed) {
      await supabase.from('phone_devices').delete().eq('id', deviceId)
      return json({ error: 'Pairing session was already claimed' }, 409)
    }
    return json({
      device_id: deviceId, device_token: rawToken, company_id: session.company_id,
      heartbeat_interval_seconds: 30, poll_interval_seconds: 2,
    })
  }

  const auth = req.headers.get('authorization')
  const rawToken = auth?.replace(/^Bearer\s+/i, '') ?? ''
  if (!rawToken) return json({ error: 'Device authorization required' }, 401)
  const { data: device } = await supabase.from('phone_devices').select('*')
    .eq('device_token_hash', await sha256(rawToken)).is('revoked_at', null).maybeSingle()
  if (!device) return json({ error: 'Unknown or revoked device' }, 401)

  if (body.action === 'heartbeat') {
    const now = new Date().toISOString()
    await supabase.from('phone_devices').update({
      status: 'online', last_heartbeat_at: now, last_seen_at: now,
      os_version: body.os_version?.slice(0, 80) ?? device.os_version,
      app_version: body.app_version?.slice(0, 80) ?? device.app_version,
      capabilities: body.capabilities ?? device.capabilities,
      updated_at: now,
    }).eq('id', device.id)
    return json({ ok: true, server_time: now })
  }

  if (body.action === 'poll') {
    const now = new Date().toISOString()
    await supabase.from('phone_devices').update({ status: 'online', last_seen_at: now, updated_at: now }).eq('id', device.id)
    await supabase.from('phone_call_commands').update({ status: 'expired', ended_at: now, updated_at: now })
      .eq('device_id', device.id).in('status', ['queued', 'delivered']).lt('expires_at', now)
    const activeStatuses = ['queued', 'delivered', 'acknowledged', 'awaiting_confirmation', 'ringing', 'connected']
    const { data: commands, error } = await supabase.from('phone_call_commands')
      .select('id,lead_id,phone_number,normalized_phone,display_name,status,requires_confirmation,expires_at,metadata,created_at')
      .eq('device_id', device.id).in('status', activeStatuses).gt('expires_at', now).order('created_at').limit(10)
    if (error) return json({ error: 'Unable to poll commands' }, 500)
    const ids = (commands ?? []).map((command) => command.id)
    if (ids.length) await supabase.from('phone_call_commands').update({ status: 'delivered', delivered_at: now, updated_at: now })
      .eq('device_id', device.id).in('id', ids).eq('status', 'queued')
    return json({ commands: (commands ?? []).map((command) => command.status === 'queued' ? { ...command, status: 'delivered' } : command), server_time: now })
  }

  if (body.action === 'event') {
    if (!body.command_id || !body.event_id || !body.event_type) return json({ error: 'Invalid call event' }, 400)
    const { data: command } = await supabase.from('phone_call_commands').select('*')
      .eq('id', body.command_id).eq('device_id', device.id).maybeSingle()
    if (!command) return json({ error: 'Call command not found' }, 404)
    const eventType = body.event_type.toLowerCase()
    const statusMap: Record<string, string> = {
      acknowledged: 'acknowledged', awaiting_confirmation: 'awaiting_confirmation',
      ringing: 'ringing', connected: 'connected', completed: 'completed', failed: 'failed',
      rejected: 'rejected', cancelled: 'cancelled',
    }
    const nextStatus = statusMap[eventType]
    if (!nextStatus) return json({ error: 'Unsupported call event' }, 400)
    const terminal = ['completed', 'failed', 'rejected', 'cancelled', 'expired'].includes(command.status)
    if (terminal && command.status !== nextStatus) return json({ error: 'Call command is already terminal' }, 409)
    const allowedTransitions: Record<string, string[]> = {
      queued: ['acknowledged', 'awaiting_confirmation', 'ringing', 'failed', 'rejected', 'cancelled'],
      delivered: ['acknowledged', 'awaiting_confirmation', 'ringing', 'failed', 'rejected', 'cancelled'],
      acknowledged: ['awaiting_confirmation', 'ringing', 'failed', 'rejected', 'cancelled'],
      awaiting_confirmation: ['ringing', 'failed', 'rejected', 'cancelled'],
      ringing: ['connected', 'completed', 'failed', 'rejected', 'cancelled'],
      connected: ['completed', 'failed', 'cancelled'],
    }
    if (!terminal && !(allowedTransitions[command.status] ?? []).includes(nextStatus) && command.status !== nextStatus) {
      return json({ error: `Invalid call transition: ${command.status} -> ${nextStatus}` }, 409)
    }

    const occurredAt = body.occurred_at ?? new Date().toISOString()
    const { error: eventError } = await supabase.from('phone_call_events').insert({
      company_id: device.company_id, command_id: command.id, device_id: device.id,
      event_id: body.event_id, event_type: eventType, payload: body.payload ?? {}, occurred_at: occurredAt,
    })
    if (eventError?.code === '23505') return json({ ok: true, idempotent_replay: true, status: command.status })
    if (eventError) return json({ error: 'Unable to record call event', detail: eventError.message }, 500)

    const update: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString() }
    if (nextStatus === 'acknowledged' || nextStatus === 'awaiting_confirmation') update.acknowledged_at = occurredAt
    if (nextStatus === 'ringing') update.started_at = occurredAt
    if (nextStatus === 'connected') update.connected_at = occurredAt
    if (['completed', 'failed', 'rejected', 'cancelled'].includes(nextStatus)) update.ended_at = occurredAt
    if (nextStatus === 'failed') {
      update.failure_code = body.payload?.code ?? 'device_error'
      update.failure_message = body.payload?.message ?? 'Call failed on device'
    }
    await supabase.from('phone_call_commands').update(update).eq('id', command.id).eq('device_id', device.id)
    await supabase.from('phone_devices').update({ last_seen_at: new Date().toISOString(), status: 'online' }).eq('id', device.id)

    const outcome = body.payload?.outcome
    if (nextStatus === 'completed' && command.lead_id && typeof outcome === 'string'
      && ['no_answer', 'callback', 'interested', 'not_interested'].includes(outcome)) {
      const duration = command.connected_at
        ? Math.max(0, Math.round((new Date(occurredAt).getTime() - new Date(command.connected_at).getTime()) / 1000)) : 0
      await supabase.from('power_dialer_calls').insert({
        company_id: device.company_id, user_id: device.user_id, lead_id: command.lead_id,
        phone_number: command.normalized_phone, outcome, notes: body.payload?.notes ?? null,
        callback_at: outcome === 'callback' ? body.payload?.callback_at ?? null : null,
        duration_seconds: duration, platform: device.platform,
        handoff_method: device.platform === 'android' ? 'android_native' : 'system_tel',
      })
    }
    return json({ ok: true, idempotent_replay: false, status: nextStatus })
  }

  return json({ error: 'Unsupported action' }, 400)
})
