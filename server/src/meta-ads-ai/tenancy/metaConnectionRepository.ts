import { readStore, updateStore } from '../../db';
import { decryptToken, encryptToken } from '../meta/tokenCrypto';

export interface MetaConnectionRecord {
  companyId: string;
  metaAccessToken: string;
  metaAdAccountId: string;
  metaBusinessId: string;
  tokenExpiresAt: string;
  connectedAt: string;
}

export function upsertMetaConnection(input: {
  companyId: string;
  accessToken: string;
  adAccountId: string;
  businessId: string;
  tokenExpiresAt: string;
}) {
  const connectedAt = new Date().toISOString();
  const encrypted = encryptToken(input.accessToken);
  updateStore((store) => {
    const existing = store.metaConnections.find((row) => row.companyId === input.companyId);
    if (existing) {
      existing.metaAccessToken = encrypted;
      existing.metaAdAccountId = input.adAccountId;
      existing.metaBusinessId = input.businessId;
      existing.tokenExpiresAt = input.tokenExpiresAt;
      existing.connectedAt = connectedAt;
    } else {
      store.metaConnections.push({
        companyId: input.companyId,
        metaAccessToken: encrypted,
        metaAdAccountId: input.adAccountId,
        metaBusinessId: input.businessId,
        tokenExpiresAt: input.tokenExpiresAt,
        connectedAt,
      });
    }
  });
}

export function getMetaConnection(companyId: string) {
  const store = readStore();
  const record = store.metaConnections.find((row) => row.companyId === companyId);
  if (!record) return null;
  try {
    return {
      ...record,
      metaAccessToken: decryptToken(record.metaAccessToken),
    } as MetaConnectionRecord;
  } catch {
    return null;
  }
}

export function removeMetaConnection(companyId: string) {
  updateStore((store) => {
    store.metaConnections = store.metaConnections.filter((row) => row.companyId !== companyId);
  });
}

