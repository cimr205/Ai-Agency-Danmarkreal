import { randomUUID } from 'crypto';
import { readStore } from '../db';
import { listLeadgenFormLeads, listLeadgenForms } from '../meta-ads-ai/meta/leadgen';
import { getMetaLeadSyncState, upsertMetaLeadSyncState } from '../repositories/metaLeadSyncRepository';
import { findCompanyDefaultOwner } from '../repositories/userRepository';
import { createLead, findLeadBySourceRef } from '../repositories/leadRepository';
import { createNotification } from '../repositories/notificationRepository';
import { triggerWorkflowsForLead } from '../services/workflowEngine';

const DEFAULT_INTERVAL_MS = 1000 * 60 * 10;

function parseMetaLeadField(fieldData: Array<{ name: string; values: string[] }> | undefined) {
  const result: Record<string, string> = {};
  fieldData?.forEach((field) => {
    const value = field.values?.[0];
    if (value) result[field.name.toLowerCase()] = value;
  });
  return result;
}

async function syncMetaLeadsForConnection(connection: {
  companyId: string;
  metaAccessToken: string;
  metaAdAccountId: string;
}) {
  const ownerUserId = findCompanyDefaultOwner(connection.companyId);
  if (!ownerUserId) return;
  const forms = await listLeadgenForms(connection.metaAccessToken, connection.metaAdAccountId);
  const formList = forms.data || [];
  for (const form of formList) {
    const syncState = getMetaLeadSyncState(connection.companyId, form.id);
    const leads = await listLeadgenFormLeads(connection.metaAccessToken, form.id);
    const leadData = leads.data || [];
    let newLeads = leadData;
    if (syncState?.lastLeadgenId) {
      const idx = leadData.findIndex((lead) => lead.id === syncState.lastLeadgenId);
      newLeads = idx >= 0 ? leadData.slice(0, idx) : leadData;
    }
    let latestId = syncState?.lastLeadgenId;
    let createdCount = 0;
    for (const lead of newLeads) {
      latestId = lead.id;
      const existing = findLeadBySourceRef(connection.companyId, 'meta_lead_ad', lead.id);
      if (existing) continue;
      const fields = parseMetaLeadField(lead.field_data);
      const name =
        fields.full_name ||
        [fields.first_name, fields.last_name].filter(Boolean).join(' ') ||
        fields.name ||
        'Meta Lead';
      const email = fields.email;
      const phone = fields.phone_number || fields.phone;
      const company = fields.company || fields.company_name;
          const created = createLead({
        id: randomUUID(),
        ownerUserId,
        companyId: connection.companyId,
        name,
        phone: phone || 'n/a',
        email,
        company,
        status: 'cold',
        source: 'meta_lead_ad',
        sourceRef: lead.id,
        sourceMeta: { form_id: form.id, form_name: form.name, created_time: lead.created_time },
      });
          await triggerWorkflowsForLead(connection.companyId || ownerUserId, created.id);
      createdCount += 1;
    }
    if (latestId) {
      upsertMetaLeadSyncState({
        companyId: connection.companyId,
        formId: form.id,
        lastLeadgenId: latestId,
      });
    }
    if (createdCount > 0) {
      createNotification({
        companyId: connection.companyId,
        userId: ownerUserId,
        title: 'Meta Lead Ads',
        body: `${createdCount} new leads captured from Meta Lead Ads.`,
      });
    }
  }
}

export async function syncMetaLeadsForCompany(companyId: string) {
  const store = readStore();
  const connections = store.metaConnections.filter((item) => item.companyId === companyId);
  for (const connection of connections) {
    await syncMetaLeadsForConnection(connection);
  }
}

export function startMetaLeadWorker() {
  const tick = async () => {
    const store = readStore();
    for (const connection of store.metaConnections) {
      await syncMetaLeadsForConnection(connection);
    }
  };

  tick().catch(() => undefined);
  const handle = setInterval(() => {
    tick().catch(() => undefined);
  }, DEFAULT_INTERVAL_MS);

  return () => clearInterval(handle);
}

