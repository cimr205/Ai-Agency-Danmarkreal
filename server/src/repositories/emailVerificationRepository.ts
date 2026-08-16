import { readStore, updateStore } from '../db';

export interface EmailVerificationRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
}

export function createEmailVerification(input: EmailVerificationRecord) {
  const createdAt = new Date().toISOString();
  updateStore((store) => {
    store.emailVerifications.push({
      id: input.id,
      userId: input.userId,
      token: input.token,
      createdAt,
      expiresAt: input.expiresAt,
    });
  });
  return { ...input, createdAt };
}

export function findEmailVerification(token: string): EmailVerificationRecord | null {
  const store = readStore();
  const row = store.emailVerifications.find(
    (item) => item.token === token && item.expiresAt > new Date().toISOString()
  );
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    token: row.token,
    expiresAt: row.expiresAt,
  };
}

export function deleteEmailVerification(id: string) {
  updateStore((store) => {
    store.emailVerifications = store.emailVerifications.filter((item) => item.id !== id);
  });
}

