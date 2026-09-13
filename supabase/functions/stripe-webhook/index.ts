// Stripe webhook receiver for invoice payments.
//
// Confirmed before writing this function: no Stripe webhook receiver exists
// anywhere in the repo. create-checkout/customer-portal/check-subscription
// only handle this SaaS platform's own subscription billing (companies.
// stripe_customer_id/subscription_status) and check-subscription only
// polls status on demand — no push webhook is consumed for ANY Stripe event
// today, so a successful subscription payment or an invoice payment is
// never pushed into the app; it's only reflected next time someone opens
// billing settings and check-subscription happens to run.
//
// This function specifically closes the invoice/payment side: it expects a
// Stripe Checkout Session (or PaymentIntent) whose `metadata.payment_reference`
// names a row in `invoice_payment_references` (created by
// create-invoice-checkout-session — see
// supabase/migrations/20260913000003_invoice_payment_references.sql). That
// reference is resolved back to invoice_id/company_id through our own
// table via resolve_invoice_payment_reference, NOT trusted from Stripe
// metadata directly — Stripe never sees invoice_id/company_id at all. Once
// resolved, this calls register_invoice_payment_service — a webhook-safe
// sibling of the frontend's register_invoice_payment RPC (which
// hard-requires auth.uid() and so cannot be called from this service-role
// context), sharing the same atomic/idempotent logic. The Stripe event id
// is used as the idempotency key, so a duplicate/retried webhook delivery
// can never double-record a payment.
//
// An event whose payment_reference doesn't resolve to any row (tampered,
// stale, or from a different environment) is logged clearly as an
// unresolved reference and does NOT call register_invoice_payment_service
// — there is no invoice to attribute it to.
import Stripe from 'https://esm.sh/stripe@18.5.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  const signature = req.headers.get('stripe-signature')
  if (!stripeSecretKey || !webhookSecret || !signature) {
    return new Response('Stripe webhook is not configured', { status: 500 })
  }

  const rawBody = await req.text()
  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-08-27.basil' })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('stripe-webhook: signature verification failed', err)
    return new Response('Invalid signature', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleInvoicePayment(supabase, {
          eventId: event.id,
          paymentReference: session.metadata?.payment_reference,
          amount: (session.amount_total ?? 0) / 100,
          method: 'stripe_checkout',
          externalReference: session.id,
        })
        break
      }
      case 'payment_intent.succeeded': {
        const intent = event.data.object as Stripe.PaymentIntent
        await handleInvoicePayment(supabase, {
          eventId: event.id,
          paymentReference: intent.metadata?.payment_reference,
          amount: intent.amount_received / 100,
          method: 'stripe_payment_intent',
          externalReference: intent.id,
        })
        break
      }
      default:
        // Subscription lifecycle events (customer.subscription.*, invoice.paid
        // for the platform's own SaaS billing) are intentionally not handled
        // here — that state is owned by check-subscription today. Handling
        // both in two places would be exactly the kind of duplicate event
        // consumer this phase is meant to eliminate, not add.
        break
    }
  } catch (err) {
    console.error('stripe-webhook: failed to process event', event.id, event.type, err)
    // Stripe retries on non-2xx. register_invoice_payment is idempotent on
    // the event id, so a retry after a transient failure is always safe.
    return new Response('Processing failed', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
})

async function handleInvoicePayment(
  supabase: ReturnType<typeof createClient>,
  args: { eventId: string; paymentReference?: string; amount: number; method: string; externalReference: string },
) {
  if (!args.paymentReference) {
    // Not an invoice payment (e.g. a subscription checkout with no
    // payment_reference metadata) — nothing for this flow to do.
    return
  }

  // Resolves through our own table rather than trusting the client/Stripe
  // metadata for invoice/company identity — see
  // supabase/migrations/20260913000003_invoice_payment_references.sql.
  const { data: resolved, error: resolveError } = await supabase
    .rpc('resolve_invoice_payment_reference', { p_reference_id: args.paymentReference })
    .maybeSingle()
  if (resolveError) throw resolveError
  if (!resolved) {
    console.error('stripe-webhook: unresolved payment_reference — no matching invoice_payment_references row', args.paymentReference, args.eventId)
    return
  }

  // register_invoice_payment (the frontend's RPC) hard-requires auth.uid()
  // and isn't callable from a service-role webhook context, so this uses
  // the webhook-safe sibling with identical atomic/idempotent logic — see
  // supabase/migrations/20260912000005_stripe_invoice_payments.sql.
  const { error } = await supabase.rpc('register_invoice_payment_service', {
    p_company_id: resolved.company_id,
    p_invoice_id: resolved.invoice_id,
    p_amount: args.amount,
    p_payment_method: args.method,
    p_idempotency_key: args.eventId,
    p_external_reference: args.externalReference,
  })
  if (error) throw error
}
