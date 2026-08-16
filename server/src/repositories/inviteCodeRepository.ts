import { readStore, updateStore } from '../db';

export interface InviteCodeRecord {
  id: string;
  code: string;
  companyId: string;
  role: 'admin' | 'user';
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedByUserId?: string;
}

export function createInviteCode(input: {
  id: string;
  code: string;
  companyId: string;
  role: 'admin' | 'user';
  expiresAt: string;
}) {
  const createdAt = new Date().toISOString();
  const record: InviteCodeRecord = { ...input, createdAt };
  updateStore((store) => {
    store.inviteCodes.push(record);
  });
  return record;
}

export function findInviteCodeByCode(code: string) {
  const store = readStore();
  return store.inviteCodes.find((row) => row.code === code) || null;
}

export function markInviteCodeUsed(id: string, usedByUserId: string) {
  const usedAt = new Date().toISOString();
  updateStore((store) => {
    const record = store.inviteCodes.find((row) => row.id === id);
    if (!record) return;
    record.usedAt = usedAt;
    record.usedByUserId = usedByUserId;
  });
  return usedAt;
}

