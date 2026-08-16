export interface MetaInsightRow {
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  spend: number;
  cpa: number;
  conversions: number;
  impressions: number;
  ctr: number;
  frequency: number;
}

export type MetaDecision =
  | { type: 'pause'; entityType: 'ad' | 'adset'; entityId: string; reason: string }
  | { type: 'scale'; entityType: 'adset'; entityId: string; newDailyBudget: number; reason: string }
  | { type: 'duplicate'; entityType: 'ad'; entityId: string; reason: string };

export function decideActions(rows: MetaInsightRow[]): MetaDecision[] {
  const decisions: MetaDecision[] = [];

  rows.forEach((row) => {
    if (row.spend > 50 && row.conversions === 0 && row.impressions > 1000) {
      if (row.ad_id) {
        decisions.push({
          type: 'pause',
          entityType: 'ad',
          entityId: row.ad_id,
          reason: 'High spend with zero conversions',
        });
      }
    }

    if (row.conversions >= 5 && row.cpa < 20) {
      if (row.adset_id) {
        decisions.push({
          type: 'scale',
          entityType: 'adset',
          entityId: row.adset_id,
          newDailyBudget: 20000,
          reason: 'Strong conversions at low CPA',
        });
      }
    }

    if (row.frequency > 2.5 && row.ctr < 0.8 && row.ad_id) {
      decisions.push({
        type: 'pause',
        entityType: 'ad',
        entityId: row.ad_id,
        reason: 'Creative fatigue detected',
      });
    }
  });

  return decisions;
}

