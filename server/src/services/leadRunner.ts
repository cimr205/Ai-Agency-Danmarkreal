import { randomUUID } from 'crypto';
import { getValidAccessToken } from './tokenManager';
import { createLead, findLeadByOwnerContact, findLeadByOwnerDomain } from '../repositories/leadRepository';
import { triggerWorkflowsForLead } from './workflowEngine';
import { createIntegrationLog } from '../repositories/integrationLogRepository';

type LeadCandidate = {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  sourceId?: string;
};

function normalizeDomain(value?: string) {
  if (!value) return null;
  try {
    const url = value.startsWith('http') ? new URL(value) : new URL(`https://${value}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isRateLimitError(error: unknown) {
  if (!error) return false;
  const message = (error as Error).message || '';
  return message.includes('429') || message.toLowerCase().includes('rate');
}

async function fetchProviderLeads(provider: string, query: string, token: string): Promise<LeadCandidate[]> {
  // Placeholder generic fetcher. Extend per provider.
  // For now, we return an empty list to avoid failures.
  void provider;
  void query;
  void token;
  return [];
}

export async function runLeadSearchJob(input: {
  jobId: string;
  userId: string;
  provider: string;
  query: string;
}) {
  const accessToken = await getValidAccessToken(input.userId, input.provider);
  if (!accessToken) {
    createIntegrationLog({
      userId: input.userId,
      provider: input.provider,
      status: 'error',
      message: 'Missing access token',
    });
    return { leadCount: 0, rateLimited: false };
  }

  try {
    const candidates = await fetchProviderLeads(input.provider, input.query, accessToken);
    let created = 0;
    for (const candidate of candidates) {
      const existing = findLeadByOwnerContact(input.userId, candidate.email, candidate.phone);
      if (existing) continue;
      const domain = normalizeDomain(candidate.website || candidate.company);
      if (domain) {
        const domainExisting = findLeadByOwnerDomain(input.userId, domain);
        if (domainExisting) continue;
      }
      const createdLead = createLead({
        id: randomUUID(),
        ownerUserId: input.userId,
        name: candidate.name || candidate.company || 'Unknown',
        phone: candidate.phone || 'n/a',
        email: candidate.email,
        company: candidate.company,
        status: 'cold',
        source: input.provider,
        sourceRef: candidate.sourceId,
      });
      await triggerWorkflowsForLead(input.userId, createdLead.id);
      created += 1;
    }
    createIntegrationLog({
      userId: input.userId,
      provider: input.provider,
      status: 'ok',
      message: `Lead run created ${created}`,
    });
    return { leadCount: created, rateLimited: false };
  } catch (error) {
    const rateLimited = isRateLimitError(error);
    createIntegrationLog({
      userId: input.userId,
      provider: input.provider,
      status: rateLimited ? 'rate_limited' : 'error',
      message: (error as Error).message,
    });
    return { leadCount: 0, rateLimited };
  }
}

