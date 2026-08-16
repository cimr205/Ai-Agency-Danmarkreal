import { createHmac, randomUUID } from 'crypto';
import { query } from '../../core/database';

export const WEBHOOK_EVENT_TYPES = [
  'lead.created',
  'lead.status_changed',
  'deal.created',
  'deal.won',
  'deal.lost',
  'invoice.created',
  'invoice.paid',
  'invoice.overdue',
  'payment.received',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const WEBHOOK_CHANNELS = ['generic', 'slack', 'teams'] as const;
export type WebhookChannel = (typeof WEBHOOK_CHANNELS)[number];

export type WebhookSubscription = {
  id: string;
  companyId: string;
  url: string;
  secret: string;
  events: string[];
  channel: WebhookChannel;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

const EVENT_LABELS: Record<string, string> = {
  'lead.created': 'New lead',
  'lead.status_changed': 'Lead status changed',
  'deal.created': 'New deal',
  'deal.won': 'Deal won',
  'deal.lost': 'Deal lost',
  'invoice.created': 'Invoice created',
  'invoice.paid': 'Invoice paid',
  'invoice.overdue': 'Invoice overdue',
  'payment.received': 'Payment received',
};

function describePayload(payload: Record<string, unknown>): string {
  const name = payload.customer_name ?? payload.name ?? payload.title ?? payload.invoice_number;
  const amount = payload.total ?? payload.amount ?? payload.value;
  const parts: string[] = [];
  if (name) parts.push(String(name));
  if (amount) parts.push(`${amount} ${payload.currency ?? 'DKK'}`);
  return parts.join(' — ');
}

/** Slack and Teams incoming webhooks expect a simple { text } body, not the raw event payload. */
function buildChatMessage(event: string, payload: Record<string, unknown>) {
  const label = EVENT_LABELS[event] ?? event;
  const detail = describePayload(payload);
  return `*Crater CRM* — ${label}${detail ? `: ${detail}` : ''}`;
}

let tablesReady: Promise<void> | null = null;

export function ensureWebhookTables() {
  if (!tablesReady) {
    tablesReady = query(
      `create table if not exists webhook_subscriptions (
        id uuid primary key default gen_random_uuid(),
        company_id text not null,
        url text not null,
        secret text not null,
        events text[] not null default '{}',
        channel text not null default 'generic',
        is_active boolean not null default true,
        created_by text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`
    )
      .then(() =>
        query(
          `create table if not exists webhook_deliveries (
            id uuid primary key default gen_random_uuid(),
            subscription_id uuid not null references webhook_subscriptions(id) on delete cascade,
            event text not null,
            payload jsonb not null,
            status text not null,
            response_status integer,
            error text,
            attempt integer not null default 1,
            created_at timestamptz not null default now()
          )`
        )
      )
      .then(() => query(`create index if not exists webhook_deliveries_subscription_idx on webhook_deliveries(subscription_id, created_at desc)`))
      .then(() => query(`alter table webhook_subscriptions add column if not exists channel text not null default 'generic'`))
      .then(() => undefined)
      .catch((error) => {
        tablesReady = null;
        throw error;
      });
  }
  return tablesReady;
}

function mapSubscription(row: Record<string, unknown>): WebhookSubscription {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    url: row.url as string,
    secret: row.secret as string,
    events: (row.events as string[]) || [],
    channel: ((row.channel as WebhookChannel) || 'generic'),
    isActive: row.is_active as boolean,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function serializeWebhookSubscription(sub: WebhookSubscription) {
  return {
    id: sub.id,
    company_id: sub.companyId,
    url: sub.url,
    events: sub.events,
    channel: sub.channel,
    is_active: sub.isActive,
    secret_preview: `${sub.secret.slice(0, 10)}…`,
    created_by: sub.createdBy,
    created_at: sub.createdAt,
    updated_at: sub.updatedAt,
  };
}

export async function listWebhookSubscriptions(companyId: string): Promise<WebhookSubscription[]> {
  await ensureWebhookTables();
  const rows = await query<Record<string, unknown>>(
    `select * from webhook_subscriptions where company_id=$1 order by created_at desc`,
    [companyId]
  );
  return rows.map(mapSubscription);
}

export async function createWebhookSubscription(input: {
  companyId: string;
  url: string;
  events: string[];
  channel?: WebhookChannel;
  createdBy: string;
}): Promise<WebhookSubscription> {
  await ensureWebhookTables();
  const secret = `whsec_${randomUUID().replace(/-/g, '')}`;
  const rows = await query<Record<string, unknown>>(
    `insert into webhook_subscriptions (company_id, url, secret, events, channel, created_by)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [input.companyId, input.url, secret, input.events, input.channel ?? 'generic', input.createdBy]
  );
  return mapSubscription(rows[0]);
}

export async function updateWebhookSubscription(
  companyId: string,
  id: string,
  patch: { url?: string; events?: string[]; channel?: WebhookChannel; isActive?: boolean }
): Promise<WebhookSubscription | null> {
  await ensureWebhookTables();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.url !== undefined) { values.push(patch.url); fields.push(`url=$${values.length}`); }
  if (patch.events !== undefined) { values.push(patch.events); fields.push(`events=$${values.length}`); }
  if (patch.channel !== undefined) { values.push(patch.channel); fields.push(`channel=$${values.length}`); }
  if (patch.isActive !== undefined) { values.push(patch.isActive); fields.push(`is_active=$${values.length}`); }
  if (!fields.length) {
    const rows = await query<Record<string, unknown>>(
      `select * from webhook_subscriptions where id=$1 and company_id=$2`,
      [id, companyId]
    );
    return rows[0] ? mapSubscription(rows[0]) : null;
  }
  values.push(companyId);
  values.push(id);
  const rows = await query<Record<string, unknown>>(
    `update webhook_subscriptions set ${fields.join(',')}, updated_at=now()
     where company_id=$${values.length - 1} and id=$${values.length} returning *`,
    values
  );
  return rows[0] ? mapSubscription(rows[0]) : null;
}

export async function deleteWebhookSubscription(companyId: string, id: string): Promise<boolean> {
  await ensureWebhookTables();
  const rows = await query<{ id: string }>(
    `delete from webhook_subscriptions where id=$1 and company_id=$2 returning id`,
    [id, companyId]
  );
  return rows.length > 0;
}

export function signPayload(secret: string, body: string) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

async function recordDelivery(input: {
  subscriptionId: string;
  event: string;
  payload: unknown;
  status: 'ok' | 'error';
  responseStatus?: number;
  error?: string;
  attempt: number;
}) {
  await query(
    `insert into webhook_deliveries (subscription_id, event, payload, status, response_status, error, attempt)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.subscriptionId,
      input.event,
      JSON.stringify(input.payload),
      input.status,
      input.responseStatus ?? null,
      input.error ?? null,
      input.attempt,
    ]
  );
}

async function deliverOnce(sub: WebhookSubscription, event: string, payload: Record<string, unknown>, attempt: number) {
  const isChatChannel = sub.channel === 'slack' || sub.channel === 'teams';
  const body = isChatChannel
    ? JSON.stringify({ text: buildChatMessage(event, payload) })
    : JSON.stringify({ event, data: payload, sent_at: new Date().toISOString() });
  const signature = signPayload(sub.secret, body);
  try {
    const response = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Slack/Teams incoming webhooks reject unexpected headers, so only sign generic deliveries.
        ...(isChatChannel ? {} : { 'X-Crater-Event': event, 'X-Crater-Signature': signature }),
      },
      body,
    });
    await recordDelivery({
      subscriptionId: sub.id,
      event,
      payload,
      status: response.ok ? 'ok' : 'error',
      responseStatus: response.status,
      attempt,
    });
    return response.ok;
  } catch (error) {
    await recordDelivery({
      subscriptionId: sub.id,
      event,
      payload,
      status: 'error',
      error: (error as Error).message,
      attempt,
    });
    return false;
  }
}

const RETRY_DELAYS_MS = [0, 5000, 30000];

async function deliverWithRetry(sub: WebhookSubscription, event: string, payload: Record<string, unknown>) {
  for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
    if (RETRY_DELAYS_MS[i] > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[i]));
    }
    const success = await deliverOnce(sub, event, payload, i + 1);
    if (success) return;
  }
}

/**
 * Fires-and-forgets delivery to every active subscription for the company that
 * listens to this event. Failures are logged to webhook_deliveries, never thrown,
 * so a broken third-party endpoint can't break the request that triggered the event.
 */
export function dispatchWebhookEvent(companyId: string, event: WebhookEventType, payload: Record<string, unknown>) {
  ensureWebhookTables()
    .then(() => query<Record<string, unknown>>(
      `select * from webhook_subscriptions where company_id=$1 and is_active=true and $2=any(events)`,
      [companyId, event]
    ))
    .then((rows) => {
      rows.map(mapSubscription).forEach((sub) => {
        deliverWithRetry(sub, event, payload).catch(() => undefined);
      });
    })
    .catch((error) => {
      console.error(`Failed to dispatch webhook event ${event} for company ${companyId}:`, error);
    });
}
