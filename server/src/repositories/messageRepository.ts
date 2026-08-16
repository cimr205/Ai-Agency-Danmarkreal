import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreData, StoreMessage } from '../db';

export function sendMessage(input: {
  companyId: string;
  senderUserId: string;
  recipientUserId: string;
  subject: string;
  body: string;
}) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const message: StoreMessage = {
    id,
    companyId: input.companyId,
    senderUserId: input.senderUserId,
    recipientUserId: input.recipientUserId,
    subject: input.subject,
    body: input.body,
    createdAt,
  };
  updateStore((store: StoreData) => {
    store.messages.push(message);
  });
  return message;
}

export function listMessagesForUser(companyId: string, userId: string) {
  const store: StoreData = readStore();
  return store.messages.filter(
    (msg) => msg.companyId === companyId && msg.recipientUserId === userId
  );
}

export function markMessageRead(messageId: string, userId: string) {
  updateStore((store: StoreData) => {
    const msg = store.messages.find((item) => item.id === messageId && item.recipientUserId === userId);
    if (msg) {
      msg.readAt = new Date().toISOString();
    }
  });
}

