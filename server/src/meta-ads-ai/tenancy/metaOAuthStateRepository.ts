import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../../db';

export interface MetaOAuthStateRecord {
  id: string;
  state: string;
  companyId: string;
  createdAt: string;
  expiresAt: string;
}

export function createMetaOAuthState(companyId: string, expiresAt: string) {
  const record: MetaOAuthStateRecord = {
    id: randomUUID(),
    state: randomUUID(),
    companyId,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  updateStore((store) => {
    store.metaOauthStates.push(record);
  });
  return record;
}

export function findMetaOAuthState(state: string) {
  const store = readStore();
  return store.metaOauthStates.find((row) => row.state === state) || null;
}

export function deleteMetaOAuthState(id: string) {
  updateStore((store) => {
    store.metaOauthStates = store.metaOauthStates.filter((row) => row.id !== id);
  });
}

