import { createHmac } from 'crypto';
import { query } from '../../core/database';
import { env } from '../../config/env';

export type WhatsappDirection = 'inbound' | 'outbound';

export type WhatsappConversation = {
  id: string;
  companyId: string;
  contactPhone: string;
  contactName: string | null;
  lastMessageAt: string;
  createdAt: string;
};

export type WhatsappMessage = {
  id: string;
  conversationId: string;
  direction: WhatsappDirection;
  body: string;
  status: string;
  twilioSid: string | null;
  createdAt: string;
};

let tablesReady: Promise<void> | null = null;

export function ensureWhatsappTables() {
  if (!tablesReady) {
    tablesReady = query(
      `create table if not exists whatsapp_conversations (
        id uuid primary key default gen_random_uuid(),
        company_id text not null,
        contact_phone text not null,
        contact_name text,
        last_message_at timestamptz not null default now(),
        created_at timestamptz not null default now(),
        unique (company_id, contact_phone)
      )`
    )
      .then(() =>
        query(
          `create table if not exists whatsapp_messages (
            id uuid primary key default gen_random_uuid(),
            conversation_id uuid not null references whatsapp_conversations(id) on delete cascade,
            direction text not null,
            body text not null,
            status text not null default 'sent',
            twilio_sid text,
            created_at timestamptz not null default now()
          )`
        )
      )
      .then(() => query(`create index if not exists whatsapp_messages_conversation_idx on whatsapp_messages(conversation_id, created_at)`))
      .then(() => undefined)
      .catch((error) => {
        tablesReady = null;
        throw error;
      });
  }
  return tablesReady;
}

function mapConversation(row: Record<string, unknown>): WhatsappConversation {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    contactPhone: row.contact_phone as string,
    contactName: (row.contact_name as string) ?? null,
    lastMessageAt: row.last_message_at as string,
    createdAt: row.created_at as string,
  };
}

function mapMessage(row: Record<string, unknown>): WhatsappMessage {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    direction: row.direction as WhatsappDirection,
    body: row.body as string,
    status: row.status as string,
    twilioSid: (row.twilio_sid as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export function serializeConversation(conv: WhatsappConversation) {
  return {
    id: conv.id,
    contact_phone: conv.contactPhone,
    contact_name: conv.contactName,
    last_message_at: conv.lastMessageAt,
    created_at: conv.createdAt,
  };
}

export function serializeMessage(msg: WhatsappMessage) {
  return {
    id: msg.id,
    conversation_id: msg.conversationId,
    direction: msg.direction,
    body: msg.body,
    status: msg.status,
    created_at: msg.createdAt,
  };
}

function normalizePhone(phone: string) {
  return phone.replace(/[\s()-]/g, '');
}

export async function listConversations(companyId: string): Promise<WhatsappConversation[]> {
  await ensureWhatsappTables();
  const rows = await query<Record<string, unknown>>(
    `select * from whatsapp_conversations where company_id=$1 order by last_message_at desc`,
    [companyId]
  );
  return rows.map(mapConversation);
}

export async function getConversation(companyId: string, id: string): Promise<WhatsappConversation | null> {
  await ensureWhatsappTables();
  const rows = await query<Record<string, unknown>>(
    `select * from whatsapp_conversations where company_id=$1 and id=$2`,
    [companyId, id]
  );
  return rows[0] ? mapConversation(rows[0]) : null;
}

export async function getOrCreateConversation(
  companyId: string,
  phone: string,
  name?: string | null
): Promise<WhatsappConversation> {
  await ensureWhatsappTables();
  const normalized = normalizePhone(phone);
  const rows = await query<Record<string, unknown>>(
    `insert into whatsapp_conversations (company_id, contact_phone, contact_name)
     values ($1,$2,$3)
     on conflict (company_id, contact_phone) do update
       set contact_name = coalesce(excluded.contact_name, whatsapp_conversations.contact_name)
     returning *`,
    [companyId, normalized, name ?? null]
  );
  return mapConversation(rows[0]);
}

/** Finds the conversation owning this phone number, regardless of company — used to route inbound webhooks on a shared Twilio WhatsApp sender. */
export async function findConversationByPhoneAnyCompany(phone: string): Promise<WhatsappConversation | null> {
  await ensureWhatsappTables();
  const normalized = normalizePhone(phone);
  const rows = await query<Record<string, unknown>>(
    `select * from whatsapp_conversations where contact_phone=$1 order by last_message_at desc limit 1`,
    [normalized]
  );
  return rows[0] ? mapConversation(rows[0]) : null;
}

export async function listMessages(companyId: string, conversationId: string): Promise<WhatsappMessage[]> {
  await ensureWhatsappTables();
  const rows = await query<Record<string, unknown>>(
    `select m.* from whatsapp_messages m
     join whatsapp_conversations c on c.id = m.conversation_id
     where c.company_id=$1 and m.conversation_id=$2
     order by m.created_at asc`,
    [companyId, conversationId]
  );
  return rows.map(mapMessage);
}

async function touchConversation(conversationId: string) {
  await query(`update whatsapp_conversations set last_message_at=now() where id=$1`, [conversationId]);
}

async function recordMessage(input: {
  conversationId: string;
  direction: WhatsappDirection;
  body: string;
  status: string;
  twilioSid?: string | null;
}): Promise<WhatsappMessage> {
  const rows = await query<Record<string, unknown>>(
    `insert into whatsapp_messages (conversation_id, direction, body, status, twilio_sid)
     values ($1,$2,$3,$4,$5) returning *`,
    [input.conversationId, input.direction, input.body, input.status, input.twilioSid ?? null]
  );
  await touchConversation(input.conversationId);
  return mapMessage(rows[0]);
}

export class WhatsappNotConfiguredError extends Error {
  constructor() {
    super('WhatsApp is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM.');
  }
}

function toWhatsappAddress(phone: string) {
  const normalized = normalizePhone(phone);
  return normalized.startsWith('whatsapp:') ? normalized : `whatsapp:${normalized}`;
}

/** Sends a WhatsApp message via Twilio's REST API and records it on the conversation. */
export async function sendWhatsappMessage(
  companyId: string,
  conversationId: string,
  body: string
): Promise<WhatsappMessage> {
  const { twilioAccountSid, twilioAuthToken, twilioWhatsappFrom } = env;
  if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsappFrom) {
    throw new WhatsappNotConfiguredError();
  }

  const conversation = await getConversation(companyId, conversationId);
  if (!conversation) throw new Error('Conversation not found');

  const params = new URLSearchParams({
    To: toWhatsappAddress(conversation.contactPhone),
    From: toWhatsappAddress(twilioWhatsappFrom),
    Body: body,
  });

  const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    }
  );

  const payload = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.message || `Twilio rejected the WhatsApp message (${response.status})`);
  }

  return recordMessage({
    conversationId,
    direction: 'outbound',
    body,
    status: 'sent',
    twilioSid: payload.sid ?? null,
  });
}

/** Records an inbound WhatsApp message against whichever company already has a conversation with this phone number. */
export async function recordInboundWhatsappMessage(fromPhone: string, body: string, twilioSid: string | null) {
  const conversation = await findConversationByPhoneAnyCompany(fromPhone);
  if (!conversation) return null;
  return recordMessage({
    conversationId: conversation.id,
    direction: 'inbound',
    body,
    status: 'received',
    twilioSid,
  });
}

/**
 * Validates Twilio's X-Twilio-Signature header per Twilio's documented algorithm:
 * HMAC-SHA1(authToken, url + sorted(key+value for each POST param)), base64-encoded.
 */
export function isValidTwilioSignature(url: string, params: Record<string, string>, signature: string | undefined): boolean {
  const { twilioAuthToken } = env;
  if (!twilioAuthToken || !signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join('');
  const expected = createHmac('sha1', twilioAuthToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  return expected === signature;
}
