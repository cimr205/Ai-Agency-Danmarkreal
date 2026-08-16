import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreAiActivity } from '../db';

export function createAiActivity(input: { companyId: string; message: string; type: string }) {
  const record: StoreAiActivity = {
    id: randomUUID(),
    companyId: input.companyId,
    message: input.message,
    type: input.type,
    createdAt: new Date().toISOString(),
  };
  updateStore((store) => {
    store.aiActivity.push(record);
  });
  return record;
}

export function listAiActivity(companyId: string) {
  const store = readStore();
  return store.aiActivity.filter((item) => item.companyId === companyId);
}

