import { describe, it, expect } from 'vitest';
import { stageWebhookEvent } from '@/lib/deals/wonValidation';

// Regression coverage for the deal.won double-fire bug found while tracing
// Flow 3 (deal-won -> onboarding): the old code called fireWebhookEvent
// unconditionally whenever `updates.stage === 'won'`, even when the deal
// was already won (a double submit, or a retried mutation). update_deal_stage
// now reports `changed` server-side, and stageWebhookEvent is the only
// place that decides whether to fire — this locks that decision down.
describe('stageWebhookEvent', () => {
  it('fires deal.won only when the RPC reports a real transition to won', () => {
    expect(stageWebhookEvent({ changed: true, stage: 'won' })).toBe('deal.won');
  });

  it('fires deal.lost only when the RPC reports a real transition to lost', () => {
    expect(stageWebhookEvent({ changed: true, stage: 'lost' })).toBe('deal.lost');
  });

  it('does not fire when re-saving an already-won deal (changed: false)', () => {
    expect(stageWebhookEvent({ changed: false, stage: 'won' })).toBeNull();
  });

  it('does not fire when re-saving an already-lost deal (changed: false)', () => {
    expect(stageWebhookEvent({ changed: false, stage: 'lost' })).toBeNull();
  });

  it('does not fire for a real transition to a non-terminal stage', () => {
    expect(stageWebhookEvent({ changed: true, stage: 'proposal' })).toBeNull();
  });
});
