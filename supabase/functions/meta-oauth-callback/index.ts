import { createClient } from 'npm:@supabase/supabase-js@2'
import { encryptMetaToken } from '../_shared/metaToken.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}
const version = 'v26.0'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function graph(path: string, token: string) {
  const response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await response.json()
  if (!response.ok || body.error) throw new Error(body.error?.message ?? `Meta request failed (${response.status})`)
  return body
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const auth = req.headers.get('authorization')
    if (!auth) return json({ error: 'Unauthorized' }, 401)
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appId = Deno.env.get('META_APP_ID')
    const appSecret = Deno.env.get('META_APP_SECRET')
    const redirectUri = Deno.env.get('META_REDIRECT_URI')
    if (!appId || !appSecret || !redirectUri) return json({ error: 'Meta OAuth is not configured' }, 500)
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
    const { data: { user }, error: authError } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)
    const { code, state } = await req.json() as { code?: string; state?: string }
    if (!code || !state) return json({ error: 'Missing authorization code or state' }, 400)

    const { data: oauthState } = await supabase.from('oauth_states').select('*')
      .eq('id', state).eq('provider', 'meta').is('consumed_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
    if (!oauthState || oauthState.created_by !== user.id) return json({ error: 'Invalid or expired OAuth state' }, 400)
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single()
    if (!profile?.company_id || profile.company_id !== oauthState.company_id) return json({ error: 'OAuth tenant mismatch' }, 403)
    const { data: consumed } = await supabase.from('oauth_states').update({ consumed_at: new Date().toISOString() })
      .eq('id', state).is('consumed_at', null).select('id').maybeSingle()
    if (!consumed) return json({ error: 'OAuth state was already consumed' }, 409)

    const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', appId)
    tokenUrl.searchParams.set('client_secret', appSecret)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)
    const shortResponse = await fetch(tokenUrl)
    const shortBody = await shortResponse.json()
    if (!shortResponse.ok || !shortBody.access_token) throw new Error(shortBody.error?.message ?? 'Token exchange failed')

    const longUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`)
    longUrl.searchParams.set('grant_type', 'fb_exchange_token')
    longUrl.searchParams.set('client_id', appId)
    longUrl.searchParams.set('client_secret', appSecret)
    longUrl.searchParams.set('fb_exchange_token', shortBody.access_token)
    const longResponse = await fetch(longUrl)
    const longBody = await longResponse.json()
    const accessToken = longBody.access_token ?? shortBody.access_token
    const expiresIn = longBody.expires_in ?? shortBody.expires_in
    const me = await graph('me?fields=id,name', accessToken)
    const accounts = await graph('me/adaccounts?fields=id,name,account_id,account_status,currency,business{id,name}&limit=100', accessToken)
    const encrypted = await encryptMetaToken(accessToken)

    const { data: connection, error: connectionError } = await supabase.from('meta_connections').upsert({
      company_id: profile.company_id,
      meta_user_id: me.id,
      meta_user_name: me.name,
      access_token: null,
      access_token_ciphertext: encrypted.ciphertext,
      token_iv: encrypted.iv,
      token_key_version: 1,
      token_expires_at: expiresIn ? new Date(Date.now() + Number(expiresIn) * 1000).toISOString() : null,
      granted_scopes: ['ads_read', 'ads_management', 'business_management'],
      status: 'connected',
      connected_at: new Date().toISOString(),
      disconnected_at: null,
      sync_status: 'idle',
      sync_error: null,
      token_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' }).select('id').single()
    if (connectionError) throw connectionError

    const accountRows = (accounts.data ?? []).map((account: Record<string, unknown>) => ({
      company_id: profile.company_id,
      meta_connection_id: connection.id,
      account_id: String(account.account_id ?? String(account.id).replace(/^act_/, '')),
      account_name: account.name ?? null,
      business_id: (account.business as Record<string, unknown> | undefined)?.id ?? null,
      business_name: (account.business as Record<string, unknown> | undefined)?.name ?? null,
      currency: account.currency ?? null,
      account_status: account.account_status == null ? null : Number(account.account_status),
    }))
    if (accountRows.length) {
      const { error } = await supabase.from('meta_ad_accounts').upsert(accountRows, { onConflict: 'company_id,account_id' })
      if (error) throw error
    }
    return json({ success: true, status: 'connected', ad_accounts_count: accountRows.length })
  } catch (cause) {
    console.error('meta-oauth-callback failed', cause instanceof Error ? cause.message : String(cause))
    return json({ error: 'Meta connection failed', detail: cause instanceof Error ? cause.message : String(cause) }, 500)
  }
})
