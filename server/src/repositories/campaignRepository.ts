import { readStore, updateStore } from '../db';

export interface CampaignRecord {
  id: string;
  ownerUserId: string;
  companyId?: string;
  name: string;
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'failed';
  templateId?: string;
  scheduledAt?: string;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignRecipientRecord {
  id: string;
  campaignId: string;
  name: string;
  email: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: string;
  error?: string;
}

export interface CampaignJobRecord {
  id: string;
  campaignId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  createdAt: string;
}

export function createCampaign(input: {
  id: string;
  ownerUserId: string;
  companyId?: string;
  name: string;
  status?: CampaignRecord['status'];
  templateId?: string;
  scheduledAt?: string;
}) {
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const record: CampaignRecord = {
    id: input.id,
    ownerUserId: input.ownerUserId,
    companyId: input.companyId,
    name: input.name,
    status: input.status || 'draft',
    templateId: input.templateId,
    scheduledAt: input.scheduledAt,
    sentCount: 0,
    failedCount: 0,
    createdAt,
    updatedAt,
  };
  updateStore((store) => {
    store.campaigns.push(record);
  });
  return record;
}

export function listCampaignsByOwner(ownerUserId: string) {
  const store = readStore();
  return store.campaigns.filter((row) => row.ownerUserId === ownerUserId);
}

export function findCampaignById(id: string) {
  const store = readStore();
  return store.campaigns.find((row) => row.id === id) || null;
}

export function updateCampaignStatus(id: string, status: CampaignRecord['status']) {
  const updatedAt = new Date().toISOString();
  updateStore((store) => {
    const campaign = store.campaigns.find((row) => row.id === id);
    if (!campaign) return;
    campaign.status = status;
    campaign.updatedAt = updatedAt;
  });
  return updatedAt;
}

export function addCampaignRecipients(campaignId: string, recipients: Array<{ id: string; name: string; email: string }>) {
  updateStore((store) => {
    recipients.forEach((recipient) => {
      store.campaignRecipients.push({
        id: recipient.id,
        campaignId,
        name: recipient.name,
        email: recipient.email,
        status: 'pending',
      });
    });
  });
}

export function listCampaignRecipients(campaignId: string) {
  const store = readStore();
  return store.campaignRecipients.filter((row) => row.campaignId === campaignId);
}

export function updateCampaignRecipientStatus(
  recipientId: string,
  status: CampaignRecipientRecord['status'],
  error?: string
) {
  const sentAt = status === 'sent' ? new Date().toISOString() : undefined;
  updateStore((store) => {
    const recipient = store.campaignRecipients.find((row) => row.id === recipientId);
    if (!recipient) return;
    recipient.status = status;
    recipient.sentAt = sentAt;
    recipient.error = error;
  });
  return sentAt;
}

export function createCampaignJob(input: { id: string; campaignId: string }) {
  const createdAt = new Date().toISOString();
  const job: CampaignJobRecord = {
    id: input.id,
    campaignId: input.campaignId,
    status: 'queued',
    createdAt,
  };
  updateStore((store) => {
    store.campaignJobs.push(job);
  });
  return job;
}

export function updateCampaignJob(
  id: string,
  updates: Partial<Omit<CampaignJobRecord, 'id' | 'campaignId' | 'createdAt'>>
) {
  updateStore((store) => {
    const job = store.campaignJobs.find((row) => row.id === id);
    if (!job) return;
    Object.assign(job, updates);
  });
}

