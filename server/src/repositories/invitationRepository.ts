import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreData, StoreInvitation } from '../db';

export function createInvitation(input: {
  companyId: string;
  email: string;
  role: 'admin' | 'user';
  expiresAt: string;
}) {
  const id = randomUUID();
  const token = randomUUID();
  const createdAt = new Date().toISOString();
  updateStore((store: StoreData) => {
    store.invitations.push({
      id,
      companyId: input.companyId,
      email: input.email,
      role: input.role,
      token,
      expiresAt: input.expiresAt,
      createdAt,
    });
  });
  return { id, token, createdAt, ...input };
}

export function findInvitationByToken(token: string): StoreInvitation | null {
  const store: StoreData = readStore();
  return store.invitations.find((inv) => inv.token === token) || null;
}

export function listInvitationsByCompany(companyId: string) {
  const store: StoreData = readStore();
  return store.invitations.filter((inv) => inv.companyId === companyId);
}

export function findInvitationByEmail(email: string) {
  const store: StoreData = readStore();
  return store.invitations.find((inv) => inv.email === email) || null;
}

export function deleteInvitation(id: string) {
  updateStore((store: StoreData) => {
    store.invitations = store.invitations.filter((inv) => inv.id !== id);
  });
}

