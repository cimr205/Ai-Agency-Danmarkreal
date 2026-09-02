import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = req.headers.get('authorization')
  if (!auth) return json({ error: 'Unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const appId = Deno.env.get('META_APP_ID')
  const redirectUri = Deno.env.get('META_REDIRECT_URI')
  if (!appId || !redirectUri) return json({ error: 'Meta OAuth is not configured' }, 500)
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: { user }, error: authError } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)
  const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single()
  if (!profile?.company_id) return json({ error: 'No company' }, 403)

  const stateId = crypto.randomUUID()
  const { error } = await supabase.from('oauth_states').insert({
    id: stateId,
    company_id: profile.company_id,
    provider: 'meta',
    created_by: user.id,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  })
  if (error) return json({ error: 'Unable to start OAuth', detail: error.message }, 500)

  const authorize = new URL('https://www.facebook.com/v26.0/dialog/oauth')
  authorize.searchParams.set('client_id', appId)
  authorize.searchParams.set('redirect_uri', redirectUri)
  authorize.searchParams.set('scope', 'ads_read,ads_management,business_management')
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('state', stateId)
  return json({ authorization_url: authorize.toString(), expires_in: 600 })
})
