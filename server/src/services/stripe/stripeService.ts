import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '../../config/env';

export class StripeNotConfiguredError extends Error {
  constructor() {
    super('Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.');
  }
}

function assertConfigured() {
  if (!env.stripeSecretKey) throw new StripeNotConfiguredError();
}

function toFormBody(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.append(key, String(value));
  }
  return search.toString();
}

export type CreateCheckoutSessionInput = {
  invoiceId: string;
  companyId: string;
  invoiceNumber: string;
  currency: string;
  totalAmount: number; // major units, e.g. DKK (incl. VAT)
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ id: string; url: string }> {
  assertConfigured();

  const unitAmount = Math.round(input.totalAmount * 100);
  const body = toFormBody({
    mode: 'payment',
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': input.currency.toLowerCase(),
    'line_items[0][price_data][unit_amount]': unitAmount,
    'line_items[0][price_data][product_data][name]': `Invoice ${input.invoiceNumber}`,
    'metadata[invoice_id]': input.invoiceId,
    'metadata[company_id]': input.companyId,
    customer_email: input.customerEmail || undefined,
  });

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = (await response.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !data.id || !data.url) {
    throw new Error(data.error?.message || `Stripe checkout session creation failed (${response.status})`);
  }
  return { id: data.id, url: data.url };
}

export type StripeCheckoutCompletedEvent = {
  invoiceId: string;
  companyId: string;
  amountTotal: number; // major units
  currency: string;
  sessionId: string;
};

export function verifyAndParseWebhook(rawBody: Buffer, signatureHeader: string | undefined): unknown {
  if (!env.stripeWebhookSecret) throw new StripeNotConfiguredError();
  if (!signatureHeader) throw new Error('Missing Stripe-Signature header');

  const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key] = value;
    return acc;
  }, {});
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error('Malformed Stripe-Signature header');

  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', env.stripeWebhookSecret).update(signedPayload, 'utf8').digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    throw new Error('Invalid Stripe webhook signature');
  }

  return JSON.parse(rawBody.toString('utf8'));
}

export function extractCheckoutCompleted(event: unknown): StripeCheckoutCompletedEvent | null {
  const e = event as { type?: string; data?: { object?: Record<string, unknown> } };
  if (e.type !== 'checkout.session.completed') return null;
  const session = e.data?.object;
  if (!session) return null;
  const metadata = (session.metadata as Record<string, string> | undefined) || {};
  if (!metadata.invoice_id || !metadata.company_id) return null;
  return {
    invoiceId: metadata.invoice_id,
    companyId: metadata.company_id,
    amountTotal: Number(session.amount_total || 0) / 100,
    currency: String(session.currency || 'dkk').toUpperCase(),
    sessionId: String(session.id || ''),
  };
}
