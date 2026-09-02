import { createClient } from 'npm:@supabase/supabase-js@2'

const PIXEL = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (char) => char.charCodeAt(0))

function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function confirmationPage(action: string) {
  const safeAction = action.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Afmeld emails</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f7f5;color:#172033"><main style="width:min(420px,calc(100% - 32px));background:white;border:1px solid #ddd;border-radius:16px;padding:28px;box-sizing:border-box"><h1 style="font-size:22px;margin:0">Afmeld marketing-emails</h1><p style="line-height:1.5;color:#5d6575">Bekræft at du ikke længere ønsker at modtage marketing-emails fra denne afsender.</p><form method="post" action="${safeAction}"><button type="submit" style="width:100%;min-height:48px;border:0;border-radius:10px;background:#172033;color:white;font-weight:700;cursor:pointer">Bekræft afmelding</button></form></main></body></html>`
}

function resultPage(success: boolean) {
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${success ? 'Afmeldt' : 'Link udløbet'}</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f7f7f5;color:#172033"><main style="text-align:center;padding:32px"><h1>${success ? 'Du er nu afmeldt' : 'Linket kunne ikke bruges'}</h1><p style="color:#5d6575">${success ? 'Du vil ikke modtage flere marketing-emails fra denne afsender.' : 'Kontakt afsenderen, hvis du fortsat ønsker at blive afmeldt.'}</p></main></body></html>`
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const unsubscribeId = url.searchParams.get('unsub')
  const recipientId = url.searchParams.get('rid')

  if (unsubscribeId) {
    if (req.method === 'GET') return html(confirmationPage(url.toString()))
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST' } })
    try {
      const supabase = adminClient()
      const { data: recipient } = await supabase.from('bulk_email_recipients')
        .select('id,campaign_id,company_id,email,unsubscribed_at').eq('id', unsubscribeId).maybeSingle()
      if (!recipient) return html(resultPage(false), 404)
      if (!recipient.unsubscribed_at) {
        const now = new Date().toISOString()
        const { error } = await supabase.from('bulk_email_recipients').update({ unsubscribed_at: now }).eq('id', recipient.id)
        if (error) throw error
        await supabase.from('email_suppression_list').upsert({
          company_id: recipient.company_id,
          email: recipient.email,
          reason: 'unsubscribe',
          source: 'campaign_unsubscribe',
          source_event_id: recipient.id,
          suppressed_at: now,
        }, { onConflict: 'company_id,normalized_email' })
        await supabase.rpc('increment_campaign_unsubs', { p_campaign_id: recipient.campaign_id })
      }
      return html(resultPage(true))
    } catch (error) {
      console.error('Unsubscribe failed', error instanceof Error ? error.message : String(error))
      return html(resultPage(false), 500)
    }
  }

  if (req.method === 'GET' && recipientId) {
    try {
      const supabase = adminClient()
      const { data: recipient } = await supabase.from('bulk_email_recipients')
        .select('id,campaign_id,opened_at,open_count').eq('id', recipientId).maybeSingle()
      if (recipient) {
        const firstOpen = !recipient.opened_at
        await supabase.from('bulk_email_recipients').update({
          opened_at: recipient.opened_at || new Date().toISOString(),
          open_count: (recipient.open_count || 0) + 1,
        }).eq('id', recipient.id)
        if (firstOpen) await supabase.rpc('increment_campaign_opens', { p_campaign_id: recipient.campaign_id })
      }
    } catch (error) {
      console.error('Open tracking failed', error instanceof Error ? error.message : String(error))
    }
    return new Response(PIXEL, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  }

  return new Response('Not found', { status: 404 })
})
