import { readStore, updateStore } from '../db';

export interface LeadRecord {
  id: string;
  ownerUserId: string;
  companyId?: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  status: string;
  leadScore: number;
  source?: string;
  sourceRef?: string;
  sourceMeta?: Record<string, unknown>;
  notes?: string;
  lastContactedAt?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export function createLead(input: {
  id: string;
  ownerUserId: string;
  companyId?: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  status: string;
  leadScore?: number;
  source?: string;
  sourceRef?: string;
  sourceMeta?: Record<string, unknown>;
  notes?: string;
  lastContactedAt?: string;
  tags?: string[];
}) {
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const leadScore = typeof input.leadScore === 'number' ? input.leadScore : 1;
  updateStore((store) => {
    store.leads.push({
      id: input.id,
      ownerUserId: input.ownerUserId,
      companyId: input.companyId,
      name: input.name,
      phone: input.phone,
      email: input.email,
      company: input.company,
      status: input.status,
      leadScore,
      source: input.source,
      sourceRef: input.sourceRef,
      sourceMeta: input.sourceMeta,
      notes: input.notes,
      lastContactedAt: input.lastContactedAt,
      tags: input.tags,
      createdAt,
      updatedAt,
    });
  });
  return {
    ...input,
    leadScore,
    createdAt,
    updatedAt,
  };
}

export function findLeadById(id: string): LeadRecord | null {
  const store = readStore();
  const row = store.leads.find((item) => item.id === id);
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    companyId: row.companyId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    status: row.status,
    leadScore: row.leadScore,
    source: row.source,
    sourceRef: row.sourceRef,
    sourceMeta: row.sourceMeta,
    notes: row.notes,
    lastContactedAt: row.lastContactedAt,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listLeadsByOwner(ownerUserId: string) {
  const store = readStore();
  return store.leads
    .filter((row) => row.ownerUserId === ownerUserId)
    .map((row) => ({
      id: row.id,
      ownerUserId: row.ownerUserId,
      companyId: row.companyId,
      name: row.name,
      phone: row.phone,
      email: row.email,
      company: row.company,
      status: row.status,
      leadScore: row.leadScore,
      source: row.source,
      sourceRef: row.sourceRef,
      sourceMeta: row.sourceMeta,
      notes: row.notes,
      lastContactedAt: row.lastContactedAt,
      tags: row.tags,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
}

export function listLeadsByCompany(companyId: string) {
  const store = readStore();
  const companyUsers = new Set(store.users.filter((user) => user.companyId === companyId).map((user) => user.id));
  return store.leads
    .filter((row) => row.companyId === companyId || companyUsers.has(row.ownerUserId))
    .map((row) => ({
      id: row.id,
      ownerUserId: row.ownerUserId,
      companyId: row.companyId,
      name: row.name,
      phone: row.phone,
      email: row.email,
      company: row.company,
      status: row.status,
      leadScore: row.leadScore,
      source: row.source,
      sourceRef: row.sourceRef,
      sourceMeta: row.sourceMeta,
      notes: row.notes,
      lastContactedAt: row.lastContactedAt,
      tags: row.tags,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
}

export function findLeadBySourceRef(companyId: string, source: string, sourceRef: string) {
  const store = readStore();
  const row = store.leads.find(
    (item) => item.companyId === companyId && item.source === source && item.sourceRef === sourceRef
  );
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    companyId: row.companyId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    status: row.status,
    leadScore: row.leadScore,
    source: row.source,
    sourceRef: row.sourceRef,
    sourceMeta: row.sourceMeta,
    notes: row.notes,
    lastContactedAt: row.lastContactedAt,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findLeadByContact(companyId: string, email?: string, phone?: string) {
  if (!email && !phone) return null;
  const store = readStore();
  const normalizedEmail = email?.toLowerCase();
  const normalizedPhone = phone?.replace(/\s+/g, '');
  const row = store.leads.find((item) => {
    if (item.companyId !== companyId) return false;
    const emailMatch =
      normalizedEmail && item.email && item.email.toLowerCase() === normalizedEmail;
    const phoneMatch =
      normalizedPhone && item.phone && item.phone.replace(/\s+/g, '') === normalizedPhone;
    return Boolean(emailMatch || phoneMatch);
  });
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    companyId: row.companyId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    status: row.status,
    leadScore: row.leadScore,
    source: row.source,
    sourceRef: row.sourceRef,
    sourceMeta: row.sourceMeta,
    notes: row.notes,
    lastContactedAt: row.lastContactedAt,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findLeadByDomain(companyId: string, domain: string) {
  const normalizedDomain = domain.toLowerCase();
  const store = readStore();
  const row = store.leads.find((item) => {
    if (item.companyId !== companyId) return false;
    const companyDomain = item.company?.toLowerCase() || '';
    const emailDomain = item.email?.split('@')[1]?.toLowerCase() || '';
    return companyDomain.includes(normalizedDomain) || emailDomain === normalizedDomain;
  });
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    companyId: row.companyId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    status: row.status,
    leadScore: row.leadScore,
    source: row.source,
    sourceRef: row.sourceRef,
    sourceMeta: row.sourceMeta,
    notes: row.notes,
    lastContactedAt: row.lastContactedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findLeadByOwnerContact(ownerUserId: string, email?: string, phone?: string) {
  if (!email && !phone) return null;
  const store = readStore();
  const normalizedEmail = email?.toLowerCase();
  const normalizedPhone = phone?.replace(/\s+/g, '');
  const row = store.leads.find((item) => {
    if (item.ownerUserId !== ownerUserId) return false;
    const emailMatch =
      normalizedEmail && item.email && item.email.toLowerCase() === normalizedEmail;
    const phoneMatch =
      normalizedPhone && item.phone && item.phone.replace(/\s+/g, '') === normalizedPhone;
    return Boolean(emailMatch || phoneMatch);
  });
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    companyId: row.companyId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    status: row.status,
    leadScore: row.leadScore,
    source: row.source,
    sourceRef: row.sourceRef,
    sourceMeta: row.sourceMeta,
    notes: row.notes,
    lastContactedAt: row.lastContactedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function findLeadByOwnerDomain(ownerUserId: string, domain: string) {
  const normalizedDomain = domain.toLowerCase();
  const store = readStore();
  const row = store.leads.find((item) => {
    if (item.ownerUserId !== ownerUserId) return false;
    const companyDomain = item.company?.toLowerCase() || '';
    const emailDomain = item.email?.split('@')[1]?.toLowerCase() || '';
    return companyDomain.includes(normalizedDomain) || emailDomain === normalizedDomain;
  });
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    companyId: row.companyId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    status: row.status,
    leadScore: row.leadScore,
    source: row.source,
    sourceRef: row.sourceRef,
    sourceMeta: row.sourceMeta,
    notes: row.notes,
    lastContactedAt: row.lastContactedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function updateLead(
  id: string,
  updates: Partial<Pick<LeadRecord, 'status' | 'notes' | 'lastContactedAt' | 'tags'>>
) {
  const updatedAt = new Date().toISOString();
  let updated: LeadRecord | null = null;
  updateStore((store) => {
    const lead = store.leads.find((item) => item.id === id);
    if (!lead) return;
    if (updates.status !== undefined) lead.status = updates.status;
    if (updates.notes !== undefined) lead.notes = updates.notes;
    if (updates.lastContactedAt !== undefined) lead.lastContactedAt = updates.lastContactedAt;
    if (updates.tags !== undefined) lead.tags = updates.tags;
    lead.updatedAt = updatedAt;
    updated = {
      id: lead.id,
      ownerUserId: lead.ownerUserId,
      companyId: lead.companyId,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      company: lead.company,
      status: lead.status,
      leadScore: lead.leadScore,
      source: lead.source,
      sourceRef: lead.sourceRef,
      sourceMeta: lead.sourceMeta,
      notes: lead.notes,
      lastContactedAt: lead.lastContactedAt,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
    };
  });
  return updated;
}

export function updateLeadScore(id: string, score: number) {
  const updatedAt = new Date().toISOString();
  updateStore((store) => {
    const lead = store.leads.find((item) => item.id === id);
    if (lead) {
      lead.leadScore = score;
      lead.updatedAt = updatedAt;
    }
  });
  return updatedAt;
}

