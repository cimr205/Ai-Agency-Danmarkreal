import { createClient } from 'npm:@supabase/supabase-js@2'
import { decryptMetaToken } from '../_shared/metaToken.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}
const graphVersion = Deno.env.get('META_GRAPH_VERSION') ?? 'v26.0'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function graphAll(path: string, accessToken: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let next: string | null = `https://graph.facebook.com/${graphVersion}/${path}`
  let pageCount = 0
  while (next && pageCount < 100) {
    let response: Response | null = null
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(next, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (response.ok) break
      if (response.status !== 429 && response.status < 500) break
      const retryAfter = Math.min(Number(response.headers.get('retry-after') ?? 1), 10)
      await pause(retryAfter * 1000 * (attempt + 1))
    }
    if (!response) throw new Error('No response from Meta')
    const body = await response.json()
    if (!response.ok || body.error) {
      const error = new Error(body.error?.message ?? `Meta request failed (${response.status})`)
      ;(error as Error & { code?: string }).code = String(body.error?.code ?? response.status)
      throw error
    }
    rows.push(...(body.data ?? []))
    next = body.paging?.next ?? null
    pageCount++
  }
  return rows
}

const numeric = (value: unknown) => value == null || value === '' ? 0 : Number(value)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = req.headers.get('authorization')
  if (!auth) return json({ error: 'Unauthorized' }, 401)
  const token = auth.replace(/^Bearer\s+/i, '')
  const request = await req.json().catch(() => ({})) as { company_id?: string; account_id?: string; since?: string; until?: string }
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let companyId: string | null = null
  let requestedBy: string | null = null
  // Never trust an unverified JWT payload to identify service callers. A
  // scheduler may select a workspace only when it presents the actual secret.
  if (token === serviceKey) {
    companyId = request.company_id ?? null
  } else {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return json({ error: 'Unauthorized' }, 401)
    requestedBy = user.id
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single()
    companyId = profile?.company_id ?? null
  }
  if (!companyId) return json({ error: 'No company' }, 403)

  const { data: job, error: jobError } = await supabase.from('meta_sync_jobs').insert({
    company_id: companyId, requested_by: requestedBy, status: 'running', started_at: new Date().toISOString(),
  }).select('id').single()
  if (jobError) return json({ error: 'Unable to create sync job', detail: jobError.message }, 500)

  try {
    const { data: connection } = await supabase.from('meta_connections')
      .select('access_token_ciphertext,token_iv,status').eq('company_id', companyId).single()
    if (!connection?.access_token_ciphertext || !connection.token_iv || connection.status !== 'connected') {
      throw new Error('Meta connection must be reconnected securely')
    }
    const accessToken = await decryptMetaToken(connection.access_token_ciphertext, connection.token_iv)
    await supabase.from('meta_connections').update({ sync_status: 'running', sync_error: null }).eq('company_id', companyId)

    let accountsQuery = supabase.from('meta_ad_accounts').select('*').eq('company_id', companyId)
    if (request.account_id) accountsQuery = accountsQuery.eq('account_id', request.account_id)
    const { data: accounts, error: accountError } = await accountsQuery
    if (accountError) throw accountError
    if (!accounts?.length) throw new Error('No Meta ad accounts are connected')

    let recordsSynced = 0
    const until = request.until ?? new Date().toISOString().slice(0, 10)
    const sinceDate = new Date()
    sinceDate.setUTCDate(sinceDate.getUTCDate() - 30)
    const since = request.since ?? sinceDate.toISOString().slice(0, 10)

    for (const account of accounts) {
      const accountPath = `act_${account.account_id}`
      const [campaigns, adSets, creatives, ads, insights, leadForms] = await Promise.all([
        graphAll(`${accountPath}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time&limit=100`, accessToken),
        graphAll(`${accountPath}/adsets?fields=id,campaign_id,name,status,effective_status,optimization_goal,daily_budget,lifetime_budget,targeting&limit=100`, accessToken),
        graphAll(`${accountPath}/adcreatives?fields=id,name,title,body,image_url,thumbnail_url,object_story_spec&limit=100`, accessToken),
        graphAll(`${accountPath}/ads?fields=id,campaign_id,adset_id,name,status,effective_status,creative{id}&limit=100`, accessToken),
        graphAll(`${accountPath}/insights?level=ad&time_increment=1&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}&fields=date_start,campaign_id,adset_id,ad_id,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,conversions&limit=100`, accessToken),
        graphAll(`${accountPath}/leadgen_forms?fields=id,name,status&limit=100`, accessToken),
      ])

      if (campaigns.length) {
        const { error } = await supabase.from('meta_campaigns').upsert(campaigns.map((item) => ({
          company_id: companyId, ad_account_id: account.id, meta_campaign_id: String(item.id),
          name: String(item.name ?? 'Untitled campaign'), objective: item.objective ?? null,
          status: item.status ?? null, effective_status: item.effective_status ?? null,
          daily_budget: item.daily_budget == null ? null : numeric(item.daily_budget) / 100,
          lifetime_budget: item.lifetime_budget == null ? null : numeric(item.lifetime_budget) / 100,
          start_time: item.start_time ?? null, stop_time: item.stop_time ?? null,
          raw: item, synced_at: new Date().toISOString(),
        })), { onConflict: 'company_id,meta_campaign_id' })
        if (error) throw error
      }
      const { data: campaignRows } = await supabase.from('meta_campaigns').select('id,meta_campaign_id')
        .eq('company_id', companyId).eq('ad_account_id', account.id)
      const campaignMap = new Map((campaignRows ?? []).map((row) => [row.meta_campaign_id, row.id]))

      if (adSets.length) {
        const { error } = await supabase.from('meta_ad_sets').upsert(adSets.map((item) => ({
          company_id: companyId, ad_account_id: account.id, campaign_id: campaignMap.get(String(item.campaign_id)) ?? null,
          meta_ad_set_id: String(item.id), meta_campaign_id: String(item.campaign_id),
          name: String(item.name ?? 'Untitled ad set'), status: item.status ?? null,
          effective_status: item.effective_status ?? null, optimization_goal: item.optimization_goal ?? null,
          daily_budget: item.daily_budget == null ? null : numeric(item.daily_budget) / 100,
          lifetime_budget: item.lifetime_budget == null ? null : numeric(item.lifetime_budget) / 100,
          targeting: item.targeting ?? null, raw: item, synced_at: new Date().toISOString(),
        })), { onConflict: 'company_id,meta_ad_set_id' })
        if (error) throw error
      }
      const { data: adSetRows } = await supabase.from('meta_ad_sets').select('id,meta_ad_set_id')
        .eq('company_id', companyId).eq('ad_account_id', account.id)
      const adSetMap = new Map((adSetRows ?? []).map((row) => [row.meta_ad_set_id, row.id]))

      if (creatives.length) {
        const { error } = await supabase.from('meta_creatives').upsert(creatives.map((item) => ({
          company_id: companyId, ad_account_id: account.id, meta_creative_id: String(item.id),
          name: item.name ?? null, title: item.title ?? null, body: item.body ?? null,
          image_url: item.image_url ?? null, thumbnail_url: item.thumbnail_url ?? null,
          object_story_spec: item.object_story_spec ?? null, raw: item, synced_at: new Date().toISOString(),
        })), { onConflict: 'company_id,meta_creative_id' })
        if (error) throw error
      }
      const { data: creativeRows } = await supabase.from('meta_creatives').select('id,meta_creative_id')
        .eq('company_id', companyId).eq('ad_account_id', account.id)
      const creativeMap = new Map((creativeRows ?? []).map((row) => [row.meta_creative_id, row.id]))

      if (ads.length) {
        const { error } = await supabase.from('meta_ads').upsert(ads.map((item) => {
          const creative = item.creative as Record<string, unknown> | undefined
          const creativeId = creative?.id ? String(creative.id) : null
          return {
            company_id: companyId, ad_account_id: account.id,
            campaign_id: campaignMap.get(String(item.campaign_id)) ?? null,
            ad_set_id: adSetMap.get(String(item.adset_id)) ?? null,
            creative_id: creativeId ? creativeMap.get(creativeId) ?? null : null,
            meta_ad_id: String(item.id), meta_campaign_id: item.campaign_id ?? null,
            meta_ad_set_id: item.adset_id ?? null, meta_creative_id: creativeId,
            name: String(item.name ?? 'Untitled ad'), status: item.status ?? null,
            effective_status: item.effective_status ?? null, raw: item, synced_at: new Date().toISOString(),
          }
        }), { onConflict: 'company_id,meta_ad_id' })
        if (error) throw error
      }

      if (insights.length) {
        const { error } = await supabase.from('meta_daily_insights').upsert(insights.filter((item) => item.ad_id).map((item) => ({
          company_id: companyId, ad_account_id: account.id, insight_date: item.date_start,
          level: 'ad', external_object_id: String(item.ad_id), campaign_id: item.campaign_id ?? null,
          adset_id: item.adset_id ?? null, ad_id: item.ad_id ?? null,
          spend: numeric(item.spend), impressions: numeric(item.impressions), reach: numeric(item.reach),
          clicks: numeric(item.clicks), ctr: numeric(item.ctr), cpc: numeric(item.cpc), cpm: numeric(item.cpm),
          actions: item.actions ?? [], conversions: numeric(item.conversions), raw: item,
          synced_at: new Date().toISOString(),
        })), { onConflict: 'company_id,level,external_object_id,insight_date' })
        if (error) throw error
      }

      // Lead-form submissions become canonical CRM entities immediately.
      // Provider lead IDs make replay safe; the RPC performs deterministic
      // identity resolution, attribution, event emission and configured task routing.
      let leadsSynced = 0
      for (const form of leadForms) {
        const submissions = await graphAll(`${String(form.id)}/leads?fields=id,created_time,field_data,campaign_id,adset_id,ad_id,form_id&limit=100`, accessToken)
        for (const submission of submissions) {
          const fields = Array.isArray(submission.field_data) ? submission.field_data as Array<{ name?: string; values?: unknown[] }> : []
          const value = (...names: string[]) => {
            const row = fields.find((field) => names.includes(String(field.name ?? '').toLowerCase()))
            return row?.values?.[0] == null ? null : String(row.values[0])
          }
          const email = value('email', 'email_address')
          const name = value('full_name', 'name') ?? ([value('first_name'), value('last_name')].filter(Boolean).join(' ') || email || 'Meta lead')
          const { error: leadError } = await supabase.rpc('ingest_meta_lead', {
            p_company_id: companyId,
            p_account_id: account.id,
            p_external_lead_id: String(submission.id),
            p_name: name,
            p_email: email,
            p_phone: value('phone_number', 'phone'),
            p_campaign_id: submission.campaign_id == null ? null : String(submission.campaign_id),
            p_adset_id: submission.adset_id == null ? null : String(submission.adset_id),
            p_ad_id: submission.ad_id == null ? null : String(submission.ad_id),
            p_form_id: submission.form_id == null ? String(form.id) : String(submission.form_id),
            p_created_at: submission.created_time ?? new Date().toISOString(),
            p_raw: submission,
          })
          if (leadError) throw new Error(`Meta lead ${String(submission.id)} failed: ${leadError.message}`)
          leadsSynced++
        }
      }
      recordsSynced += campaigns.length + adSets.length + creatives.length + ads.length + insights.length + leadsSynced
    }

    await supabase.from('meta_connections').update({
      last_sync_at: new Date().toISOString(), sync_status: 'completed', sync_error: null,
    }).eq('company_id', companyId)
    await supabase.from('meta_sync_jobs').update({
      status: 'completed', records_synced: recordsSynced, completed_at: new Date().toISOString(),
    }).eq('id', job.id)
    return json({ success: true, job_id: job.id, records_synced: recordsSynced, api_version: graphVersion })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : null
    const rateLimited = code === '4' || code === '17' || code === '32' || code === '613' || code === '429'
    await supabase.from('meta_connections').update({ sync_status: rateLimited ? 'rate_limited' : 'failed', sync_error: message }).eq('company_id', companyId)
    await supabase.from('meta_sync_jobs').update({
      status: rateLimited ? 'rate_limited' : 'failed', error_code: code, error_message: message,
      retry_after: rateLimited ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id)
    return json({ error: 'Meta sync failed', detail: message, job_id: job.id }, rateLimited ? 429 : 500)
  }
})
