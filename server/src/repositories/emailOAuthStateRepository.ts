import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';

export interface EmailOAuthStateRecord {
  id: string;
  state: string;
  ownerUserId: string;
  createdAt: string;
  expiresAt: string;
}

export function createEmailOAuthState(input: { ownerUserId: string; expiresAt: string }) {
  const record: EmailOAuthStateRecord = {
    id: randomUUID(),
    state: randomUUID(),
    ownerUserId: input.ownerUserId,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
  };
  updateStore((store) => {
    store.emailOauthStates.push(record);
  });
  return record;
}

export function findEmailOAuthState(state: string) {
  const store = readStore();
  return store.emailOauthStates.find((row) => row.state === state) || null;
}

export function deleteEmailOAuthState(id: string) {
  updateStore((store) => {
    store.emailOauthStates = store.emailOauthStates.filter((row) => row.id !== id);
  });
}

