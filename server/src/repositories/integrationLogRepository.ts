import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreIntegrationLog } from '../db';

export function createIntegrationLog(input: {
  userId: string;
  provider: string;
  status: StoreIntegrationLog['status'];
  message: string;
}) {
  const record: StoreIntegrationLog = {
    id: randomUUID(),
    userId: input.userId,
    provider: input.provider,
    status: input.status,
    message: input.message,
    createdAt: new Date().toISOString(),
  };
  updateStore((store) => {
    store.integrationLogs.push(record);
  });
  return record;
}

export function countIntegrationErrors() {
  const store = readStore();
  return store.integrationLogs.filter((log) => log.status === 'error').length;
}

