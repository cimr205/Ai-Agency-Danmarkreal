import { readStore, updateStore } from '../db';

export interface EmailMessageRecord {
  id: string;
  ownerUserId: string;
  accountId: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string[];
  subject: string;
  body: string;
  threadId?: string;
  messageId?: string;
  receivedAt?: string;
  sentAt?: string;
  handledAt?: string;
  handledStatus?: string;
  handledReason?: string;
  handledBy?: string;
  isRead?: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createEmailMessage(input: Omit<EmailMessageRecord, 'createdAt' | 'updatedAt'>) {
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const record: EmailMessageRecord = { ...input, createdAt, updatedAt };
  updateStore((store) => {
    store.emails.push(record);
  });
  return record;
}

export function listEmailsByOwner(ownerUserId: string) {
  const store = readStore();
  return store.emails.filter((row) => row.ownerUserId === ownerUserId);
}

export function listUnhandledEmails() {
  const store = readStore();
  return store.emails.filter((row) => !row.handledAt && row.direction === 'inbound');
}

export function markEmailHandled(
  id: string,
  updates: { handledStatus: string; handledReason?: string; handledBy?: string }
) {
  const handledAt = new Date().toISOString();
  const updatedAt = handledAt;
  let updated: EmailMessageRecord | null = null;
  updateStore((store) => {
    const email = store.emails.find((row) => row.id === id);
    if (!email) return;
    email.handledAt = handledAt;
    email.handledStatus = updates.handledStatus;
    email.handledReason = updates.handledReason;
    email.handledBy = updates.handledBy;
    email.updatedAt = updatedAt;
    updated = { ...email };
  });
  return updated;
}

export function markEmailRead(id: string, isRead: boolean) {
  const updatedAt = new Date().toISOString();
  updateStore((store) => {
    const email = store.emails.find((row) => row.id === id);
    if (!email) return;
    email.isRead = isRead;
    email.updatedAt = updatedAt;
  });
  return updatedAt;
}

