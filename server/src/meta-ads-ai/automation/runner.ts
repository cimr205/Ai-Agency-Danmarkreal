import { metaGet } from '../meta/apiClient';
import { decideActions, MetaInsightRow } from '../ai/rules';
import { executeDecision } from './actions';
import { canChangeEntity } from '../safety/guards';
import { getMetaConnection } from '../tenancy/metaConnectionRepository';
import { logMetaAutomation } from '../logs/logger';
import { updateStore } from '../../db';

interface InsightResponse {
  data: Array<{
    ad_id?: string;
    adset_id?: string;
    campaign_id?: string;
    spend?: string;
    cpa?: string;
    conversions?: string;
    impressions?: string;
    ctr?: string;
    frequency?: string;
  }>;
}

function normalizeRows(data: InsightResponse['data']): MetaInsightRow[] {
  return data.map((row) => ({
    ad_id: row.ad_id,
    adset_id: row.adset_id,
    campaign_id: row.campaign_id,
    spend: Number(row.spend || 0),
    cpa: Number(row.cpa || 0),
    conversions: Number(row.conversions || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    frequency: Number(row.frequency || 0),
  }));
}

export async function runMetaAutomation(companyId: string) {
  const connection = getMetaConnection(companyId);
  if (!connection) return;

  const insights = await metaGet<InsightResponse>(
    `act_${connection.metaAdAccountId}/insights`,
    connection.metaAccessToken,
    {
      fields: 'ad_id,adset_id,campaign_id,spend,cpa,conversions,impressions,ctr,frequency',
      time_increment: '1',
    }
  );

  const rows = normalizeRows(insights.data || []);
  const decisions = decideActions(rows);

  for (const decision of decisions) {
    if (!canChangeEntity(companyId, decision.entityType, decision.entityId)) {
      continue;
    }
    try {
      await executeDecision(decision, connection.metaAccessToken);
      updateStore((store) => {
        store.metaEntityChanges.push({
          id: `${companyId}-${decision.entityType}-${decision.entityId}-${Date.now()}`,
          companyId,
          entityType: decision.entityType,
          entityId: decision.entityId,
          action: decision.type,
          createdAt: new Date().toISOString(),
        });
      });
      logMetaAutomation(companyId, decision.type, 'ok', decision.reason);
    } catch (error) {
      logMetaAutomation(companyId, decision.type, 'error', (error as Error).message);
    }
  }
}

