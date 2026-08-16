import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreIntegrationOAuthState } from '../db';

export function createIntegrationOAuthState(input: {
  userId: string;
  provider: string;
  expiresAt: string;
}) {
  const record: StoreIntegrationOAuthState = {
    id: randomUUID(),
    state: randomUUID(),
    userId: input.userId,
    provider: input.provider,
    createdAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
  };
  updateStore((store) => {
    store.integrationOauthStates.push(record);
  });
  return record;
}

export function findIntegrationOAuthState(state: string) {
  const store = readStore();
  return store.integrationOauthStates.find((item) => item.state === state) || null;
}

export function deleteIntegrationOAuthState(id: string) {
  updateStore((store) => {
    store.integrationOauthStates = store.integrationOauthStates.filter((item) => item.id !== id);
  });
}

