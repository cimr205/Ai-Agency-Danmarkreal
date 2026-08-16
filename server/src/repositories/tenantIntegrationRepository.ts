import { randomUUID } from 'crypto';
import { readStore, updateStore, type StoreTenantIntegration, type StoreWebsiteEvent } from '../db';

function normalizeDomains(domains: string[]) {
  return domains
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function ensureTenantIntegration(companyId: string) {
  const store = readStore();
  const existing = store.tenantIntegrations.find((row) => row.companyId === companyId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const created: StoreTenantIntegration = {
    companyId,
    websiteTrackingKey: randomUUID().replace(/-/g, ''),
    websiteDomains: [],
    createdAt: now,
    updatedAt: now,
  };

  updateStore((draft) => {
    draft.tenantIntegrations.push(created);
  });

  return created;
}

export function getTenantIntegration(companyId: string) {
  const store = readStore();
  return store.tenantIntegrations.find((row) => row.companyId === companyId) || null;
}

export function updateTenantIntegration(
  companyId: string,
  input: {
    websiteDomains?: string[];
    metaPixelId?: string | null;
    metaCapiToken?: string | null;
    rotateKey?: boolean;
  }
) {
  const now = new Date().toISOString();
  return updateStore((store) => {
    let integration = store.tenantIntegrations.find((row) => row.companyId === companyId);
    if (!integration) {
      integration = {
        companyId,
        websiteTrackingKey: randomUUID().replace(/-/g, ''),
        websiteDomains: [],
        createdAt: now,
        updatedAt: now,
      };
      store.tenantIntegrations.push(integration);
    }

    if (input.websiteDomains) {
      integration.websiteDomains = normalizeDomains(input.websiteDomains);
    }
    if (typeof input.metaPixelId !== 'undefined') {
      integration.metaPixelId = input.metaPixelId ?? undefined;
    }
    if (typeof input.metaCapiToken !== 'undefined') {
      integration.metaCapiToken = input.metaCapiToken ?? undefined;
    }
    if (input.rotateKey) {
      integration.websiteTrackingKey = randomUUID().replace(/-/g, '');
    }
    integration.updatedAt = now;
    return integration;
  });
}

export function findTenantIntegrationByKey(key: string) {
  const store = readStore();
  return store.tenantIntegrations.find((row) => row.websiteTrackingKey === key) || null;
}

export function logWebsiteEvent(input: {
  companyId: string;
  eventName: string;
  url?: string;
  referrer?: string;
  payload?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  const event: StoreWebsiteEvent = {
    id: randomUUID(),
    companyId: input.companyId,
    eventName: input.eventName,
    url: input.url,
    referrer: input.referrer,
    payload: input.payload,
    createdAt: now,
  };

  updateStore((store) => {
    store.websiteEvents.push(event);
  });

  return event;
}

