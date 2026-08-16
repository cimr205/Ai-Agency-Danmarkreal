import { readStore, updateStore } from '../db';
import type { StoreAiMemory } from '../db';

export function getAiMemory(companyId: string) {
  const store = readStore();
  return store.aiMemory.find((item) => item.companyId === companyId) || null;
}

export function upsertAiMemory(companyId: string, summary: string) {
  const updatedAt = new Date().toISOString();
  let record: StoreAiMemory | null = null;
  updateStore((store) => {
    const existing = store.aiMemory.find((item) => item.companyId === companyId);
    if (existing) {
      existing.summary = summary;
      existing.updatedAt = updatedAt;
      record = existing;
      return;
    }
    const created: StoreAiMemory = { companyId, summary, updatedAt };
    store.aiMemory.push(created);
    record = created;
  });
  return record;
}

