import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreIntegrationConnection } from '../db';
import { encryptToken, decryptToken } from '../meta-ads-ai/meta/tokenCrypto';

export type IntegrationTokens = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

function encryptValue(value?: string) {
  if (!value) return undefined;
  return encryptToken(value);
}

function decryptValue(value?: string) {
  if (!value) return undefined;
  return decryptToken(value);
}

export function upsertIntegrationConnection(input: {
  userId: string;
  provider: string;
  tokens: IntegrationTokens;
}) {
  const now = new Date().toISOString();
  let record: StoreIntegrationConnection | undefined;
  updateStore((store) => {
    record = store.integrationConnections.find(
      (item) => item.userId === input.userId && item.provider === input.provider
    );
    if (record) {
      record.access_token = encryptValue(input.tokens.accessToken);
      record.refresh_token = encryptValue(input.tokens.refreshToken);
      record.expires_at = input.tokens.expiresAt;
      record.updatedAt = now;
    } else {
      store.integrationConnections.push({
        id: randomUUID(),
        userId: input.userId,
        provider: input.provider,
        access_token: encryptValue(input.tokens.accessToken),
        refresh_token: encryptValue(input.tokens.refreshToken),
        expires_at: input.tokens.expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
  return record || null;
}

export function removeIntegrationConnection(userId: string, provider: string) {
  updateStore((store) => {
    store.integrationConnections = store.integrationConnections.filter(
      (item) => !(item.userId === userId && item.provider === provider)
    );
  });
}

export function listIntegrationConnections(userId: string) {
  const store = readStore();
  return store.integrationConnections
    .filter((item) => item.userId === userId)
    .map((item) => ({
      provider: item.provider,
      connectedAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
}

export function getIntegration(userId: string, provider: string) {
  const store = readStore();
  const record = store.integrationConnections.find(
    (item) => item.userId === userId && item.provider === provider
  );
  if (!record) return null;
  try {
    return {
      accessToken: decryptValue(record.access_token),
      refreshToken: decryptValue(record.refresh_token),
      expiresAt: record.expires_at,
    };
  } catch {
    return null;
  }
}

