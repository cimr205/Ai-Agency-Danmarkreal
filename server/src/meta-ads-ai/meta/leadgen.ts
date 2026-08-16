import { metaGet } from './apiClient';

export async function listLeadgenForms(accessToken: string, adAccountId: string) {
  return metaGet<{ data?: Array<{ id: string; name?: string; created_time?: string }> }>(
    `act_${adAccountId}/leadgen_forms`,
    accessToken,
    { fields: 'id,name,created_time' }
  );
}

export async function listLeadgenFormLeads(accessToken: string, formId: string) {
  return metaGet<{
    data?: Array<{ id: string; created_time?: string; field_data?: Array<{ name: string; values: string[] }> }>;
  }>(`${formId}/leads`, accessToken, { fields: 'id,created_time,field_data' });
}

