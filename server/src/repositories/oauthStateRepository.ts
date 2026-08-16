import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreData, StoreOAuthState } from '../db';

export function createOAuthState(input: { inviteToken?: string; expiresAt: string }) {
  const id = randomUUID();
  const state = randomUUID();
  const createdAt = new Date().toISOString();
  const record: StoreOAuthState = {
    id,
    state,
    inviteToken: input.inviteToken,
    createdAt,
    expiresAt: input.expiresAt,
  };
  updateStore((store: StoreData) => {
    store.oauthStates.push(record);
  });
  return record;
}

export function findOAuthState(state: string) {
  const store: StoreData = readStore();
  return store.oauthStates.find((item) => item.state === state) || null;
}

export function deleteOAuthState(id: string) {
  updateStore((store: StoreData) => {
    store.oauthStates = store.oauthStates.filter((item) => item.id !== id);
  });
}

