import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import { upsertCompany } from '../services/postgresCompanies';
import type { StoreCompany, StoreData } from '../db';

export function createCompany(input: {
  name: string;
  ownerUserId?: string;
  userLimit?: number;
  joinCode: string;
  defaultLanguage: string;
  defaultTheme: 'light' | 'dark';
  status?: 'pending' | 'active';
  mode?: 'setup' | 'live' | 'locked';
  complianceChecklist?: Array<{
    id: string;
    label: string;
    completed: boolean;
    updatedAt?: string;
  }>;
}) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  updateStore((store: StoreData) => {
    store.companies.push({
      id,
      name: input.name,
      ownerUserId: input.ownerUserId,
      userLimit: input.userLimit,
      joinCode: input.joinCode,
      defaultLanguage: input.defaultLanguage,
      defaultTheme: input.defaultTheme,
      createdAt,
      status: input.status || 'pending',
      mode: input.mode || 'setup',
      complianceChecklist: input.complianceChecklist,
    });
  });
  void upsertCompany({
    id,
    name: input.name,
    ownerUserId: input.ownerUserId,
    userLimit: input.userLimit,
    joinCode: input.joinCode,
    defaultLanguage: input.defaultLanguage,
    defaultTheme: input.defaultTheme,
    createdAt,
  });
  return {
    id,
    name: input.name,
    ownerUserId: input.ownerUserId,
    userLimit: input.userLimit,
    joinCode: input.joinCode,
    defaultLanguage: input.defaultLanguage,
    defaultTheme: input.defaultTheme,
    createdAt,
    status: input.status || 'pending',
    mode: input.mode || 'setup',
    complianceChecklist: input.complianceChecklist,
  };
}

export function listCompanies() {
  const store: StoreData = readStore();
  return store.companies;
}

export function findCompanyById(id: string): StoreCompany | null {
  const store: StoreData = readStore();
  return store.companies.find((item) => item.id === id) || null;
}

export function findCompanyByJoinCode(joinCode: string): StoreCompany | null {
  const store: StoreData = readStore();
  return store.companies.find((item) => item.joinCode.toLowerCase() === joinCode.toLowerCase()) || null;
}

export function updateCompanySettings(
  companyId: string,
  input: { defaultLanguage?: string; defaultTheme?: 'light' | 'dark' }
) {
  const updated = updateStore((store: StoreData) => {
    const company = store.companies.find((item) => item.id === companyId);
    if (!company) return null;
    if (input.defaultLanguage) company.defaultLanguage = input.defaultLanguage;
    if (input.defaultTheme) company.defaultTheme = input.defaultTheme;
    return { ...company };
  });
  if (updated) {
    void upsertCompany(updated);
  }
  return findCompanyById(companyId);
}

export function listCompaniesWithCounts() {
  const store: StoreData = readStore();
  return store.companies.map((company) => {
    const userCount = store.users.filter((user) => user.companyId === company.id).length;
    return { ...company, userCount };
  });
}

