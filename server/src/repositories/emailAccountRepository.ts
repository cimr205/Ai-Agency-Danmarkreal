import { readStore, updateStore } from '../db';

export interface EmailAccountRecord {
  id: string;
  ownerUserId: string;
  companyId?: string;
  provider: 'gmail' | 'smtp';
  email: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function createEmailAccount(input: {
  id: string;
  ownerUserId: string;
  companyId?: string;
  provider: 'gmail' | 'smtp';
  email: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
}) {
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const record: EmailAccountRecord = {
    id: input.id,
    ownerUserId: input.ownerUserId,
    companyId: input.companyId,
    provider: input.provider,
    email: input.email,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    tokenExpiresAt: input.tokenExpiresAt,
    createdAt,
    updatedAt,
  };
  updateStore((store) => {
    store.emailAccounts.push(record);
  });
  return record;
}

export function listEmailAccountsByOwner(ownerUserId: string) {
  const store = readStore();
  return store.emailAccounts.filter((row) => row.ownerUserId === ownerUserId);
}

export function findEmailAccountById(id: string) {
  const store = readStore();
  return store.emailAccounts.find((row) => row.id === id) || null;
}

export function updateEmailAccount(
  id: string,
  updates: Partial<Omit<EmailAccountRecord, 'id' | 'ownerUserId' | 'createdAt'>>
) {
  let updated: EmailAccountRecord | null = null;
  const updatedAt = new Date().toISOString();
  updateStore((store) => {
    const account = store.emailAccounts.find((row) => row.id === id);
    if (!account) return;
    Object.assign(account, updates, { updatedAt });
    updated = { ...account };
  });
  return updated;
}

