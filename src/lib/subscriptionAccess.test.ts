import { describe, expect, it } from 'vitest';
import { hasSubscriptionAccess } from './subscriptionAccess';

const now = new Date('2026-10-31T12:00:00Z').getTime();

describe('hasSubscriptionAccess', () => {
  it('lets an active subscription in, whatever the trial date says', () => {
    expect(hasSubscriptionAccess('active', null, now)).toBe(true);
    expect(hasSubscriptionAccess('active', '2020-01-01T00:00:00Z', now)).toBe(true);
  });

  it('lets a running trial in', () => {
    expect(hasSubscriptionAccess('trialing', '2026-11-05T00:00:00Z', now)).toBe(true);
  });

  it('lets a trial granted directly on the company in', () => {
    expect(hasSubscriptionAccess('none', '2099-12-31T23:59:59+00:00', now)).toBe(true);
  });

  it('blocks a trial that has ended', () => {
    expect(hasSubscriptionAccess('trialing', '2026-10-14T00:00:00Z', now)).toBe(false);
  });

  it('blocks a trialing status without an end date', () => {
    expect(hasSubscriptionAccess('trialing', null, now)).toBe(false);
  });

  it('blocks companies without a subscription or trial', () => {
    expect(hasSubscriptionAccess('none', null, now)).toBe(false);
    expect(hasSubscriptionAccess(null, null, now)).toBe(false);
    expect(hasSubscriptionAccess('past_due', null, now)).toBe(false);
    expect(hasSubscriptionAccess('canceled', '2026-10-01T00:00:00Z', now)).toBe(false);
  });
});
