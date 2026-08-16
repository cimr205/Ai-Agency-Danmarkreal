import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreAiSuggestion } from '../db';

export function createAiSuggestion(input: {
  companyId: string;
  type: StoreAiSuggestion['type'];
  title: string;
  description: string;
  json: Record<string, unknown>;
}) {
  const record: StoreAiSuggestion = {
    id: randomUUID(),
    companyId: input.companyId,
    type: input.type,
    title: input.title,
    description: input.description,
    json: input.json,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  updateStore((store) => {
    store.aiSuggestions.push(record);
  });
  return record;
}

export function listAiSuggestions(companyId: string, status?: StoreAiSuggestion['status']) {
  const store = readStore();
  return store.aiSuggestions.filter(
    (item) => item.companyId === companyId && (!status || item.status === status)
  );
}

export function updateAiSuggestionStatus(id: string, status: StoreAiSuggestion['status']) {
  let updated: StoreAiSuggestion | null = null;
  updateStore((store) => {
    const suggestion = store.aiSuggestions.find((item) => item.id === id);
    if (!suggestion) return;
    suggestion.status = status;
    updated = suggestion;
  });
  return updated;
}

