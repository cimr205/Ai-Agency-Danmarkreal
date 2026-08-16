import { randomUUID } from 'crypto';
import type { StoreClowdBotSearchJob } from '../../db';
import { findCompanyDefaultOwner } from '../../repositories/userRepository';
import { createLead, findLeadByContact, findLeadBySourceRef } from '../../repositories/leadRepository';
import { createNotification } from '../../repositories/notificationRepository';
import {
  createClowdBotSearchRun,
  finishClowdBotSearchRun,
} from '../../repositories/clowdBotSearchRunRepository';
import { recordClowdBotJobRun } from '../../repositories/clowdBotSearchJobRepository';
import { createClowdBotDelivery } from '../../repositories/clowdBotDeliveryRepository';
import { getClowdBotIntegrationConfig } from '../../repositories/clowdBotIntegrationRepository';
import { triggerWorkflowsForLead } from '../workflowEngine';
import { generateSearchQueries, scoreLeadCandidate } from '../ai/leadSearchService';
import {
  fetchFromApollo,
  fetchFromGooglePlaces,
  fetchFromHubSpot,
  fetchFromSalesforce,
  enrichWithClearbit,
  enrichWithHunter,
  type LeadCandidate,
  type SearchCriteria,
} from './providers';

function getDatePartsInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    dateKey: `${map.year}-${map.month}-${map.day}`,
  };
}

function shouldRunJob(job: StoreClowdBotSearchJob, now: Date) {
  const intervalMinutes = job.schedule.intervalMinutes || 30;
  if (!job.lastRunAt) return true;
  const lastRun = new Date(job.lastRunAt).getTime();
  return now.getTime() - lastRun >= intervalMinutes * 60 * 1000;
}

function shouldDeliver(job: StoreClowdBotSearchJob, now: Date) {
  const timeZone = job.schedule.deliverTimezone || 'Europe/Copenhagen';
  const parts = getDatePartsInTimezone(now, timeZone);
  const dateKey = parts.dateKey;
  const isAfterDeliveryHour = parts.hour >= job.schedule.deliverHour;
  const alreadyDelivered = job.lastDeliveryDate === dateKey;
  return { shouldDeliver: isAfterDeliveryHour && !alreadyDelivered, dateKey };
}

function normalizeDomain(website?: string) {
  if (!website) return undefined;
  try {
    const url = website.startsWith('http') ? new URL(website) : new URL(`https://${website}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

async function enrichCandidate(candidate: LeadCandidate, companyId: string) {
  const domain = normalizeDomain(candidate.website || candidate.company);
  if (!domain) return candidate;
  const hunterConfig = getClowdBotIntegrationConfig(companyId, 'hunter');
  const clearbitConfig = getClowdBotIntegrationConfig(companyId, 'clearbit');
  const [hunterData, clearbitData] = await Promise.all([
    hunterConfig ? enrichWithHunter(domain, hunterConfig) : Promise.resolve(null),
    clearbitConfig ? enrichWithClearbit(domain, clearbitConfig) : Promise.resolve(null),
  ]);
  return {
    ...candidate,
    raw: {
      ...(candidate.raw || {}),
      hunter: hunterData || undefined,
      clearbit: clearbitData || undefined,
    },
  };
}

async function collectCandidates(job: StoreClowdBotSearchJob, criteria: SearchCriteria) {
  const candidates: LeadCandidate[] = [];
  const companyId = job.companyId;
  if (job.sources.includes('google_places')) {
    const config = getClowdBotIntegrationConfig(companyId, 'google_places');
    if (config) {
      candidates.push(...(await fetchFromGooglePlaces(criteria, config)));
    }
  }
  if (job.sources.includes('apollo')) {
    const config = getClowdBotIntegrationConfig(companyId, 'apollo');
    if (config) {
      candidates.push(...(await fetchFromApollo(criteria, config)));
    }
  }
  if (job.sources.includes('hubspot')) {
    const config = getClowdBotIntegrationConfig(companyId, 'hubspot');
    if (config) {
      candidates.push(...(await fetchFromHubSpot(config)));
    }
  }
  if (job.sources.includes('salesforce')) {
    const config = getClowdBotIntegrationConfig(companyId, 'salesforce');
    if (config) {
      candidates.push(...(await fetchFromSalesforce(config)));
    }
  }
  return candidates;
}

async function persistCandidates(job: StoreClowdBotSearchJob, criteria: SearchCriteria, candidates: LeadCandidate[]) {
  const ownerUserId = findCompanyDefaultOwner(job.companyId);
  if (!ownerUserId) return 0;
  let created = 0;
  for (const candidate of candidates) {
    if (candidate.sourceId) {
      const existing = findLeadBySourceRef(job.companyId, candidate.source, candidate.sourceId);
      if (existing) continue;
    }
    const existingByContact = findLeadByContact(job.companyId, candidate.email, candidate.phone);
    if (existingByContact) continue;

    const enriched = await enrichCandidate(candidate, job.companyId);
    const score = scoreLeadCandidate(enriched, criteria);
    const createdLead = createLead({
      id: randomUUID(),
      ownerUserId,
      companyId: job.companyId,
      name: enriched.name || enriched.company || 'Unknown',
      phone: enriched.phone || 'n/a',
      email: enriched.email,
      company: enriched.company,
      status: 'cold',
      leadScore: score,
      source: enriched.source,
      sourceRef: enriched.sourceId,
      sourceMeta: { ...(enriched.raw || {}), clowdbot_job_id: job.id, clowdbot_job_name: job.name },
    });
    await triggerWorkflowsForLead(job.companyId || ownerUserId, createdLead.id);
    created += 1;
  }
  return created;
}

export async function runClowdBotJob(job: StoreClowdBotSearchJob) {
  const start = new Date().toISOString();
  const run = createClowdBotSearchRun({
    jobId: job.id,
    companyId: job.companyId,
    status: 'running',
    startedAt: start,
  });
  try {
    const queries = await generateSearchQueries(job.criteria);
    const criteria = { ...job.criteria, keywords: queries.length ? queries : job.criteria.keywords };
    const candidates = await collectCandidates(job, criteria);
    const created = await persistCandidates(job, criteria, candidates);
    finishClowdBotSearchRun({
      runId: run.id,
      status: 'done',
      finishedAt: new Date().toISOString(),
      leadCount: created,
    });
    recordClowdBotJobRun(job.companyId, job.id, { lastRunAt: new Date().toISOString() });
    return created;
  } catch (error) {
    finishClowdBotSearchRun({
      runId: run.id,
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: (error as Error).message,
    });
    recordClowdBotJobRun(job.companyId, job.id, { lastRunAt: new Date().toISOString() });
    return 0;
  }
}

export function getDeliveryStatus(job: StoreClowdBotSearchJob, now: Date) {
  return shouldDeliver(job, now);
}

export async function deliverClowdBotJob(job: StoreClowdBotSearchJob, leadCount: number, dateKey: string) {
  createClowdBotDelivery({
    jobId: job.id,
    companyId: job.companyId,
    dateKey,
    leadCount,
  });
  recordClowdBotJobRun(job.companyId, job.id, { lastDeliveryDate: dateKey });
  const ownerUserId = findCompanyDefaultOwner(job.companyId);
  if (ownerUserId) {
    createNotification({
      companyId: job.companyId,
      userId: ownerUserId,
      title: 'ClowdBot leads ready',
      body: `Job "${job.name}" found ${leadCount} new leads. Ready by ${job.schedule.deliverHour}:00.`,
    });
  }
}

export function canRunJob(job: StoreClowdBotSearchJob, now: Date) {
  return shouldRunJob(job, now);
}

