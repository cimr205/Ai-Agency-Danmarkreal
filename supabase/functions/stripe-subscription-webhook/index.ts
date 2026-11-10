// Onboarding 3/7: AI Agency Danmark's own seat-subscription billing had NO
// webhook at all — subscription status/seat count were only ever synced by
// check-subscription polling Stripe on page load / every 60s. That means:
//   - a cancellation, payment failure, or seat-quantity change in Stripe
//     wasn't reflected until the next time someone happened to load a page
//     that polls (could be minutes, could be never if nobody's logged in)
//   - nothing durable recorded *why* a subscription changed, for support/audit
// (stripe-payment-webhook exists, but it's scoped to a different feature —
// customers paying AI Agency Danmark's *own customers'* invoices via
// invoice_payment_reference metadata; it explicitly ignores everything else.)
//
// This reuses the same idempotency table (provider_webhook_receipts, unique
// on (provider, external_event_id)) and critical-alert pattern as
// stripe-payment-webhook, per "reuse the existing architecture."
//
// Order-of-delivery safety: rather than trusting the subscription object
// embedded in whatever event arrived (which could be stale if Stripe
// retries/reorders delivery), every handler re-fetches the subscription
// live from Stripe before writing — so an out-of-order webhook can't
// regress the stored state to something older than what's already synced.

import { withSentry } from "../_shared/sentry.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import { sendCriticalAlert } from "../_shared/criticalAlert.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
]);

Deno.serve(withSentry("stripe-subscription-webhook", async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) return json({ error: "Webhook signature unavailable" }, 401);

  const raw = await req.text();
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) return json({ error: "STRIPE_SECRET_KEY not configured" }, 500);
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, webhookSecret);
  } catch {
    return json({ error: "Invalid signature" }, 401);
  }

  if (!HANDLED_EVENTS.has(event.type)) return json({ received: true, ignored: true });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Idempotency: same table/pattern as stripe-payment-webhook. A duplicate
  // delivery (Stripe retries on any non-2xx, or just sends twice) hits the
  // unique constraint and is a no-op, not a double-processed event.
  const { data: receipt, error: receiptError } = await db
    .from("provider_webhook_receipts")
    .insert({ provider: "stripe_subscription", external_event_id: event.id, status: "received", payload: event })
    .select("id")
    .maybeSingle();
  if (receiptError?.code === "23505") return json({ received: true, status: "duplicate" });
  if (receiptError || !receipt) return json({ error: "Receipt persistence failed" }, 500);

  const markResolved = async (status: "processed" | "unresolved" | "failed", error?: string, companyId?: string) => {
    await db.from("provider_webhook_receipts")
      .update({ status, error, company_id: companyId, processed_at: new Date().toISOString() })
      .eq("id", receipt.id);
  };

  try {
    let subscriptionId: string | null = null;
    let companyIdHint: string | null = null;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return json({ received: true, ignored: true });
      subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
      companyIdHint = session.metadata?.company_id ?? null;
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      subscriptionId = sub.id;
      companyIdHint = sub.metadata?.company_id ?? null;
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id ?? null;
    }

    if (!subscriptionId) {
      await markResolved("unresolved", "No subscription id on event");
      return json({ received: true, status: "unresolved" }, 202);
    }

    // Always re-fetch live — never trust the embedded payload for the
    // write, so a delayed/reordered webhook can't stomp newer state.
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const companyId = companyIdHint ?? sub.metadata?.company_id ?? null;

    let company: { id: string } | null = null;
    if (companyId) {
      const { data } = await db.from("companies").select("id").eq("id", companyId).maybeSingle();
      company = data;
    }
    if (!company) {
      const { data } = await db.from("companies").select("id").eq("stripe_customer_id", sub.customer as string).maybeSingle();
      company = data;
    }
    if (!company) {
      await markResolved("unresolved", `No company found for subscription ${sub.id}`);
      return json({ received: true, status: "unresolved" }, 202);
    }

    const quantity = sub.items.data[0]?.quantity ?? 0;
    const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;

    const { error: updateError } = await db.from("companies").update({
      stripe_subscription_id: sub.id,
      subscription_status: sub.status,
      purchased_seats: sub.status === "active" ? quantity : undefined,
      trial_ends_at: trialEndsAt ?? undefined,
    }).eq("id", company.id);

    if (updateError) {
      await markResolved("failed", updateError.message, company.id);
      await sendCriticalAlert({
        severity: "critical",
        source: "stripe-subscription-webhook",
        message: `Failed to sync subscription status for company: ${updateError.message}`,
        companyId: company.id,
        context: { stripe_event_id: event.id, event_type: event.type, subscription_id: sub.id },
      });
      return json({ error: "Subscription sync failed" }, 500);
    }

    // Activation event — log once per company, not on every subsequent
    // renewal/update ping. Best-effort: never let analytics fail the
    // webhook itself. Ships in a migration not yet applied; a missing
    // table/column just no-ops here like it does on the client side.
    if (["active", "trialing"].includes(sub.status)) {
      try {
        const { data: already } = await db
          .from("product_events")
          .select("id")
          .eq("company_id", company.id)
          .eq("event_name", "subscription_activated")
          .limit(1);
        if (!already?.length) {
          await db.from("product_events").insert({ company_id: company.id, event_name: "subscription_activated" });
        }
      } catch { /* analytics must never break the webhook */ }
    }

    await markResolved("processed", undefined, company.id);
    return json({ received: true, status: "processed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markResolved("failed", message);
    await sendCriticalAlert({
      severity: "critical",
      source: "stripe-subscription-webhook",
      message: `Unhandled error processing subscription webhook: ${message}`,
      context: { stripe_event_id: event.id, event_type: event.type },
    });
    return json({ error: "Internal error" }, 500);
  }
}));
