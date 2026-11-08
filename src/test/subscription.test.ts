import { describe, it, expect } from 'vitest';

describe('Subscription tiers', () => {
  const PRICE_ID = 'price_1TIWHDRmhuA1UO2DtPQydBJs';
  const PRODUCT_ID = 'prod_UH4QapzbRWmFbK';

  it('should have valid Stripe product config', () => {
    expect(PRICE_ID).toMatch(/^price_/);
    expect(PRODUCT_ID).toMatch(/^prod_/);
  });

  // There used to be a "should have correct price (499 DKK)" test here that
  // asserted `49900 / 100 === 499` — that only checks arithmetic, not the
  // actual Stripe price, so it could never fail even if the real configured
  // amount drifted from the 499 kr. shown across the UI (landing page,
  // onboarding wizard, subscription page, legal docs). This repo has no
  // Stripe API credentials available to fetch the live price and assert
  // against it. The 499 kr. figure is UNVERIFIED — confirm the actual
  // amount for PRICE_ID in the Stripe Dashboard before trusting any UI
  // copy that quotes it. See docs/onboarding/03-stripe-subscriptions.md.
});

describe('Retry with backoff', () => {
  it('should succeed on first try', async () => {
    const { retryWithBackoff } = await import('@/lib/retryWithBackoff');
    const result = await retryWithBackoff(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('should retry on failure', async () => {
    const { retryWithBackoff } = await import('@/lib/retryWithBackoff');
    let attempts = 0;
    const result = await retryWithBackoff(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      },
      { maxRetries: 3, baseDelayMs: 10 }
    );
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw after max retries', async () => {
    const { retryWithBackoff } = await import('@/lib/retryWithBackoff');
    await expect(
      retryWithBackoff(async () => { throw new Error('always fails'); }, { maxRetries: 2, baseDelayMs: 10 })
    ).rejects.toThrow('always fails');
  });
});

describe('getErrorMessage', () => {
  it('should extract message from Error', async () => {
    const { getErrorMessage } = await import('@/lib/retryWithBackoff');
    expect(getErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('should handle string errors', async () => {
    const { getErrorMessage } = await import('@/lib/retryWithBackoff');
    expect(getErrorMessage('string error')).toBe('string error');
  });

  it('should handle unknown errors', async () => {
    const { getErrorMessage } = await import('@/lib/retryWithBackoff');
    expect(getErrorMessage(null)).toBe('En uventet fejl opstod. Prøv igen.');
  });
});
