// Regression tests for the trial-overwrite security fix (2026-11-11). Two
// things had to change together: (1) create-checkout must stop
// unconditionally granting/renewing a trial every time checkout opens, and
// (2) access control must check the real trial_ends_at, not just
// subscription_status (a 'trialing' row never flips to anything else on its
// own, so status alone never actually expires).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasSubscriptionAccess } from '@/lib/subscriptionAccess';

const CHECKOUT_SRC = readFileSync(
  path.resolve(process.cwd(), 'supabase/functions/create-checkout/index.ts'),
  'utf-8',
);

describe('create-checkout no longer grants/extends a trial on its own (regression)', () => {
  it('does not unconditionally set trial_ends_at on the company row', () => {
    // The bug: every checkout open set trial_ends_at = now+3d regardless of
    // whether the company already had a trial, so an admin could keep the
    // company's trial alive forever by repeatedly opening checkout.
    expect(CHECKOUT_SRC).not.toMatch(/trial_ends_at:\s*trialEnds\.toISOString\(\)/);
  });

  it('does not unconditionally set subscription_status to trialing on checkout', () => {
    expect(CHECKOUT_SRC).not.toMatch(/subscription_status:\s*["']trialing["'],?\s*\n[\s\S]{0,40}\.eq\("id", company\.id\)/);
  });

  it('lets the customer choose the number of users on the checkout page (no hidden 5-seat default)', () => {
    expect(CHECKOUT_SRC).toMatch(/adjustable_quantity:\s*\{\s*enabled:\s*true/);
    expect(CHECKOUT_SRC).not.toMatch(/seat_limit_trial\s*\|\|\s*5/);
  });

  it('only offers a Stripe trial period when the company has never had one', () => {
    expect(CHECKOUT_SRC).toMatch(/company\.trial_ends_at\s*\?\s*\{\}\s*:\s*\{\s*trial_period_days:\s*3\s*\}/);
  });
});

describe('hasSubscriptionAccess — a normal user cannot extend their own trial, an expired trial is always blocked', () => {
  const now = new Date('2026-11-11T12:00:00Z').getTime();

  it('an active paid subscription always has access, independent of trial_ends_at', () => {
    expect(hasSubscriptionAccess('active', null, now)).toBe(true);
    expect(hasSubscriptionAccess('active', '2020-01-01T00:00:00Z', now)).toBe(true);
  });

  it('a running trial has access', () => {
    expect(hasSubscriptionAccess('trialing', '2026-11-20T00:00:00Z', now)).toBe(true);
  });

  it('blocks a company whose status is stuck on "trialing" after the trial end date has passed', () => {
    // This is the exact shape of the bug: status never changes itself, only
    // trial_ends_at does. Before the fix, ACTIVE_STATUSES.has('trialing')
    // alone granted access forever.
    expect(hasSubscriptionAccess('trialing', '2026-10-01T00:00:00Z', now)).toBe(false);
  });

  it('a manually-granted future trial_ends_at still grants access regardless of status (intentional: partner/test accounts)', () => {
    expect(hasSubscriptionAccess('canceled', '2099-01-01T00:00:00Z', now)).toBe(true);
  });

  it('authorized access still works for every valid combination', () => {
    expect(hasSubscriptionAccess('active', null, now)).toBe(true);
    expect(hasSubscriptionAccess('trialing', '2026-12-01T00:00:00Z', now)).toBe(true);
    expect(hasSubscriptionAccess('none', '2099-12-31T23:59:59+00:00', now)).toBe(true); // manual partner/test grant
  });

  it('rejects missing or invalid trial data safely (fails closed, not open)', () => {
    expect(hasSubscriptionAccess(null, null, now)).toBe(false);
    expect(hasSubscriptionAccess('trialing', null, now)).toBe(false);
    expect(hasSubscriptionAccess('trialing', 'not-a-date', now)).toBe(false);
  });
});
