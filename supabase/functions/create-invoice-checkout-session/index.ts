// Creates a Stripe Checkout Session for a tenant invoice.
//
// Confirmed before writing this function: register_invoice_payment_service
// and stripe-webhook already existed (previous pass), but nothing created
// the Checkout Session itself — a webhook with nothing to receive.
//
// Security model:
// - JWT required. The caller's company is resolved server-side from
//   auth.uid() via profiles — never trusted from the request body.
// - create_invoice_payment_reference (SQL RPC) re-verifies, independently
//   of this function, that the invoice belongs to the caller's own
//   company before creating anything. A client cannot pay/generate a link
//   for another tenant's invoice by supplying its id.
// - Stripe's Checkout Session metadata carries ONLY the opaque
//   `payment_reference` (the reference row's id) — never invoice_id or
//   company_id. stripe-webhook resolves the reference back to
//   invoice_id/company_id through our own table, not from anything
//   client- or Stripe-supplied.
//
// invoices has no per-row currency column (checked: baseline schema), so
// this assumes DKK, consistent with the rest of the app's invoicing UI.
import Stripe from 'https://esm.sh/stripe@18.5.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!stripeSecretKey) return json({ error: 'Stripe is not configured' }, 500)

  try {
    const { invoice_id, invoice_number, locale } = await req.json() as {
      invoice_id?: string
      invoice_number?: string
      locale?: string
    }
    if (!invoice_id) return json({ error: 'invoice_id is required' }, 400)

    // User-scoped client: create_invoice_payment_reference runs as this
    // caller (auth.uid()), which is exactly what makes its own
    // company-ownership check meaningful.
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    )

    const { data: refData, error: refError } = await supabaseUser
      .rpc('create_invoice_payment_reference', { p_invoice_id: invoice_id })
      .single()
    if (refError) {
      // Includes "Invoice not found for this company" — i.e. the caller
      // does not own this invoice, or auth is missing/invalid. Never falls
      // through to creating a Stripe session in that case.
      return json({ error: refError.message }, 400)
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-08-27.basil' })
    const origin = req.headers.get('origin') || 'https://bridge-orbit-core.lovable.app'
    const loc = locale || 'en'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'dkk',
          unit_amount: Math.round(Number(refData.amount) * 100),
          product_data: { name: invoice_number ? `Invoice ${invoice_number}` : 'Invoice payment' },
        },
        quantity: 1,
      }],
      metadata: { payment_reference: refData.id },
      success_url: `${origin}/${loc}/app/finance/invoices?payment=success`,
      cancel_url: `${origin}/${loc}/app/finance/invoices?payment=cancelled`,
    })

    // Service-role client only to stamp the Stripe session id back onto our
    // own reference row for later lookup/support — not for any
    // authorization decision.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    await supabaseAdmin
      .from('invoice_payment_references')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', refData.id)

    return json({ checkout_url: session.url })
  } catch (err) {
    console.error('create-invoice-checkout-session failed', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
