import { createClient } from 'npm:@supabase/supabase-js@2'

type Delivery = {
  delivery_id: string
  recipient_id: string | null
  campaign_job_id: string
  campaign_id: string
  company_id: string
  sender_user_id: string
  recipient_email: string
  recipient_name: string | null
  payload: Record<string, unknown>
  lock_token: string
  attempts: number
}

type Attachment = {
  filename: string
  contentType: string
  base64: string
}

type GmailAccount = {
  id: string
  email_address: string
  access_token: string
  refresh_token: string
  token_expires_at: string | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function parseRole(token: string): string | null {
  try {
    const payload = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).role ?? null
  } catch {
    return null
  }
}

function personalize(value: string, name: string | null, email: string): string {
  const fullName = name?.trim() || email
  const parts = fullName.split(/\s+/)
  return value
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{first_name\}\}/gi, parts[0] ?? '')
    .replace(/\{\{last_name\}\}/gi, parts.slice(1).join(' '))
    .replace(/\{\{email\}\}/gi, email)
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

function encodeHeader(value: string): string {
  const bytes = new TextEncoder().encode(safeHeader(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `=?UTF-8?B?${btoa(binary)}?=`
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function buildMime(input: {
  from: string
  fromName?: string
  to: string
  replyTo?: string
  subject: string
  html: string
  text?: string
  messageId: string
  unsubscribeUrl: string
  attachments: Attachment[]
}) {
  const mixed = `mixed_${crypto.randomUUID()}`
  const alternative = `alt_${crypto.randomUUID()}`
  const from = input.fromName ? `${encodeHeader(input.fromName)} <${safeHeader(input.from)}>` : safeHeader(input.from)
  const lines = [
    `From: ${from}`,
    `To: ${safeHeader(input.to)}`,
    `Subject: ${encodeHeader(input.subject)}`,
    `Message-ID: ${input.messageId}`,
    ...(input.replyTo ? [`Reply-To: ${safeHeader(input.replyTo)}`] : []),
    `List-Unsubscribe: <${input.unsubscribeUrl}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    '',
    `--${alternative}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text ?? input.html.replace(/<[^>]+>/g, ' '),
    `--${alternative}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    `--${alternative}--`,
  ]
  for (const attachment of input.attachments) {
    const filename = safeHeader(attachment.filename).replaceAll('"', "'")
    lines.push(
      `--${mixed}`,
      `Content-Type: ${safeHeader(attachment.contentType)}; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      attachment.base64.replace(/.{1,76}/g, '$&\r\n').trim(),
    )
  }
  lines.push(`--${mixed}--`)
  return lines.join('\r\n')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = req.headers.get('authorization')
  const token = auth?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token || parseRole(token) !== 'service_role') return json({ error: 'Forbidden' }, 403)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!url || !serviceKey || !googleClientId || !googleClientSecret) return json({ error: 'Server configuration error' }, 500)

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const body = await req.json().catch(() => ({})) as { limit?: number }
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100)
  const { data, error } = await supabase.rpc('claim_email_delivery_jobs', { p_limit: limit })
  if (error) return json({ error: 'Unable to claim deliveries', detail: error.message }, 500)

  const deliveries = (data ?? []) as Delivery[]
  const results: Array<{ id: string; status: string; error?: string }> = []
  const accountCache = new Map<string, Promise<GmailAccount>>()
  const attachmentCache = new Map<string, Promise<Attachment[]>>()

  const getAccount = (userId: string) => {
    let pending = accountCache.get(userId)
    if (!pending) {
      pending = (async () => {
        const { data: account, error: accountError } = await supabase.from('email_accounts')
          .select('id,email_address,access_token,refresh_token,token_expires_at')
          .eq('user_id', userId).eq('provider', 'gmail').eq('status', 'connected').single()
        if (accountError || !account) throw new Error('The campaign owner does not have a connected Gmail account')
        const typed = account as GmailAccount
        if (!typed.token_expires_at || new Date(typed.token_expires_at).getTime() > Date.now() + 60_000) return typed
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            refresh_token: typed.refresh_token,
            grant_type: 'refresh_token',
          }),
        })
        const refreshed = await refreshResponse.json()
        if (!refreshResponse.ok || !refreshed.access_token) throw new Error('Gmail token refresh failed')
        typed.access_token = refreshed.access_token
        typed.token_expires_at = new Date(Date.now() + Number(refreshed.expires_in ?? 3600) * 1000).toISOString()
        await supabase.from('email_accounts').update({ access_token: typed.access_token, token_expires_at: typed.token_expires_at }).eq('id', typed.id)
        return typed
      })()
      accountCache.set(userId, pending)
    }
    return pending
  }

  const getAttachments = (campaignId: string) => {
    let pending = attachmentCache.get(campaignId)
    if (!pending) {
      pending = (async () => {
        const { data: assets, error: assetError } = await supabase.from('campaign_assets')
          .select('storage_bucket,storage_path,file_name,content_type').eq('campaign_id', campaignId)
        if (assetError) throw assetError
        return await Promise.all((assets ?? []).map(async (asset) => {
          const { data: blob, error: downloadError } = await supabase.storage.from(asset.storage_bucket).download(asset.storage_path)
          if (downloadError || !blob) throw downloadError ?? new Error(`Unable to load ${asset.file_name}`)
          return {
            filename: asset.file_name,
            contentType: asset.content_type,
            base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
          }
        }))
      })()
      attachmentCache.set(campaignId, pending)
    }
    return pending
  }

  for (const delivery of deliveries) {
    try {
      const { data: suppressed } = await supabase.from('email_suppression_list').select('id')
        .eq('company_id', delivery.company_id).eq('normalized_email', delivery.recipient_email.trim().toLowerCase()).maybeSingle()
      if (suppressed) {
        await supabase.rpc('complete_email_delivery', { p_delivery_id: delivery.delivery_id, p_lock_token: delivery.lock_token, p_status: 'suppressed', p_error: 'Recipient is suppressed' })
        results.push({ id: delivery.delivery_id, status: 'suppressed' })
        continue
      }

      const [account, attachments] = await Promise.all([
        getAccount(delivery.sender_user_id),
        getAttachments(delivery.campaign_id),
      ])
      const messageId = `<${delivery.delivery_id}@mail.aiagencydanmark.dk>`
      const search = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`rfc822msgid:${messageId}`)}&maxResults=1`, {
        headers: { Authorization: `Bearer ${account.access_token}` },
      })
      const searchResult = search.ok ? await search.json() : { messages: [] }
      let providerMessageId = searchResult.messages?.[0]?.id as string | undefined

      if (!providerMessageId) {
        const payload = delivery.payload ?? {}
        const trackingBase = Deno.env.get('SUPABASE_URL')!
        const recipientId = delivery.recipient_id ?? delivery.delivery_id
        const unsubscribeUrl = `${trackingBase}/functions/v1/email-track?unsub=${encodeURIComponent(recipientId)}`
        const trackedHtml = personalize(String(payload.html ?? ''), delivery.recipient_name, delivery.recipient_email)
          + `<img src="${trackingBase}/functions/v1/email-track?rid=${encodeURIComponent(recipientId)}" width="1" height="1" style="display:none" alt="" />`
          + `<p style="font-size:12px;color:#777"><a href="${unsubscribeUrl}">Unsubscribe</a></p>`
        const raw = buildMime({
          from: account.email_address,
          fromName: typeof payload.from_name === 'string' ? payload.from_name : undefined,
          to: delivery.recipient_email,
          replyTo: typeof payload.reply_to === 'string' ? payload.reply_to : undefined,
          subject: personalize(String(payload.subject ?? ''), delivery.recipient_name, delivery.recipient_email),
          html: trackedHtml,
          text: typeof payload.text === 'string' ? personalize(payload.text, delivery.recipient_name, delivery.recipient_email) : undefined,
          messageId,
          unsubscribeUrl,
          attachments,
        })
        const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${account.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: base64Url(raw) }),
        })
        const sendResult = await sendResponse.json()
        if (!sendResponse.ok || !sendResult.id) throw new Error(`Gmail send failed (${sendResponse.status})`)
        providerMessageId = String(sendResult.id)
      }

      const { error: completeError } = await supabase.rpc('complete_email_delivery', {
        p_delivery_id: delivery.delivery_id,
        p_lock_token: delivery.lock_token,
        p_status: 'sent',
        p_provider_message_id: providerMessageId,
      })
      if (completeError) throw completeError
      results.push({ id: delivery.delivery_id, status: 'sent' })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      await supabase.rpc('complete_email_delivery', {
        p_delivery_id: delivery.delivery_id,
        p_lock_token: delivery.lock_token,
        p_status: 'failed',
        p_error: message.slice(0, 2000),
      })
      results.push({ id: delivery.delivery_id, status: 'retry_or_failed', error: message })
    }
  }

  return json({ claimed: deliveries.length, processed: results.length, results })
})
