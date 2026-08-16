import { readStore, updateStore } from '../db';

export interface EmailTemplateRecord {
  id: string;
  companyId: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export function createEmailTemplate(input: { id: string; companyId: string; name: string; subject: string; body: string }) {
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const record: EmailTemplateRecord = { ...input, createdAt, updatedAt };
  updateStore((store) => {
    store.emailTemplates.push(record);
  });
  return record;
}

export function listEmailTemplates(companyId: string) {
  const store = readStore();
  return store.emailTemplates.filter((row) => row.companyId === companyId);
}

export function findEmailTemplateById(id: string) {
  const store = readStore();
  return store.emailTemplates.find((row) => row.id === id) || null;
}

export function updateEmailTemplate(id: string, updates: Partial<Omit<EmailTemplateRecord, 'id' | 'companyId' | 'createdAt'>>) {
  const updatedAt = new Date().toISOString();
  let updated: EmailTemplateRecord | null = null;
  updateStore((store) => {
    const template = store.emailTemplates.find((row) => row.id === id);
    if (!template) return;
    Object.assign(template, updates, { updatedAt });
    updated = { ...template };
  });
  return updated;
}

export function deleteEmailTemplate(id: string) {
  updateStore((store) => {
    store.emailTemplates = store.emailTemplates.filter((row) => row.id !== id);
  });
}

