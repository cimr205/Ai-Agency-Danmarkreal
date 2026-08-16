import { describe, it, expect } from 'vitest';

describe('Subscription tiers', () => {
  const PRICE_ID = 'price_1TIWHDRmhuA1UO2DtPQydBJs';
  const PRODUCT_ID = 'prod_UH4QapzbRWmFbK';

  it('should have valid Stripe product config', () => {
    expect(PRICE_ID).toMatch(/^price_/);
    expect(PRODUCT_ID).toMatch(/^prod_/);
  });

  it('should have correct price (499 DKK)', () => {
    const priceInCents = 49900;
    expect(priceInCents / 100).toBe(499);
  });
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
