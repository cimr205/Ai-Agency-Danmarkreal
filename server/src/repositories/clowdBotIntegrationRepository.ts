import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreClowdBotIntegration } from '../db';
import { encryptToken, decryptToken } from '../meta-ads-ai/meta/tokenCrypto';

export type ClowdBotProvider = StoreClowdBotIntegration['provider'];
export type ClowdBotAuthType = StoreClowdBotIntegration['authType'];

export type ClowdBotIntegrationConfig = {
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  instanceUrl?: string;
  projectId?: string;
  additional?: Record<string, string>;
};

function encodeConfig(config: ClowdBotIntegrationConfig) {
  return encryptToken(JSON.stringify(config));
}

function decodeConfig(payload: string) {
  return JSON.parse(decryptToken(payload)) as ClowdBotIntegrationConfig;
}

export function upsertClowdBotIntegration(input: {
  companyId: string;
  provider: ClowdBotProvider;
  authType: ClowdBotAuthType;
  config: ClowdBotIntegrationConfig;
}) {
  const now = new Date().toISOString();
  let record: StoreClowdBotIntegration | undefined;
  updateStore((store) => {
    record = store.clowdBotIntegrations.find(
      (item) => item.companyId === input.companyId && item.provider === input.provider
    );
    if (record) {
      record.authType = input.authType;
      record.encryptedConfig = encodeConfig(input.config);
      record.status = 'connected';
      record.updatedAt = now;
    } else {
      store.clowdBotIntegrations.push({
        id: randomUUID(),
        companyId: input.companyId,
        provider: input.provider,
        authType: input.authType,
        encryptedConfig: encodeConfig(input.config),
        status: 'connected',
        createdAt: now,
        updatedAt: now,
      });
    }
  });
  return record || null;
}

export function removeClowdBotIntegration(companyId: string, provider: ClowdBotProvider) {
  updateStore((store) => {
    store.clowdBotIntegrations = store.clowdBotIntegrations.filter(
      (item) => !(item.companyId === companyId && item.provider === provider)
    );
  });
}

export function listClowdBotIntegrations(companyId: string) {
  const store = readStore();
  return store.clowdBotIntegrations
    .filter((item) => item.companyId === companyId)
    .map((item) => ({
      provider: item.provider,
      authType: item.authType,
      status: item.status,
      updatedAt: item.updatedAt,
    }));
}

export function getClowdBotIntegrationConfig(companyId: string, provider: ClowdBotProvider) {
  const store = readStore();
  const record = store.clowdBotIntegrations.find(
    (item) => item.companyId === companyId && item.provider === provider
  );
  if (!record) return null;
  try {
    return decodeConfig(record.encryptedConfig);
  } catch {
    return null;
  }
}

