import { metaPost } from '../meta/apiClient';
import { MetaDecision } from '../ai/rules';

export async function executeDecision(decision: MetaDecision, accessToken: string) {
  if (decision.type === 'pause') {
    await metaPost(`${decision.entityId}`, accessToken, { status: 'PAUSED' });
  }
  if (decision.type === 'scale' && decision.entityType === 'adset') {
    await metaPost(`${decision.entityId}`, accessToken, { daily_budget: decision.newDailyBudget });
  }
  if (decision.type === 'duplicate') {
    // Placeholder for duplication logic; requires creative retrieval + creation.
    await metaPost(`${decision.entityId}`, accessToken, { status: 'PAUSED' });
  }
}

