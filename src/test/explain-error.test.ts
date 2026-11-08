import { describe, it, expect, vi } from 'vitest';

// errors.ts imports functions.ts, which imports the Supabase client singleton
// — mock it so this purely-formatting test suite never needs real env vars.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const { explainError } = await import('@/lib/errors');
const { AppError } = await import('@/lib/functions');
type AppErrorKind = import('@/lib/functions').AppErrorKind;
type Locale = import('@/lib/i18n').Locale;

function appError(opts: {
  functionName?: string;
  status?: number;
  kind?: AppErrorKind;
  serverMessage?: string;
  hint?: string;
  requestId?: string;
}) {
  return new AppError({
    functionName: opts.functionName ?? 'cvr-search',
    status: opts.status,
    kind: opts.kind ?? 'http',
    serverMessage: opts.serverMessage,
    hint: opts.hint,
    requestId: opts.requestId,
  });
}

const LOCALES: Locale[] = ['da', 'en', 'de'];

describe('explainError — never leaks SDK/JSON jargon', () => {
  it('never contains "Edge Function" or "non-2xx" even if the server message itself does', () => {
    const err = appError({ status: 500, serverMessage: 'Edge Function returned a non-2xx status code' });
    const explained = explainError(err, { locale: 'da' });
    expect(explained.message).not.toMatch(/edge function/i);
    expect(explained.message).not.toMatch(/non-2xx/i);
  });

  it('never contains raw JSON braces', () => {
    const err = appError({ status: 500 });
    const explained = explainError(err, { locale: 'da' });
    expect(explained.message).not.toMatch(/[{}]/);
  });
});

describe('explainError — status classes, all three locales', () => {
  const cases: Array<{ status: number; label: string }> = [
    { status: 400, label: 'bad request' },
    { status: 422, label: 'unprocessable' },
    { status: 401, label: 'unauthorized' },
    { status: 403, label: 'forbidden' },
    { status: 404, label: 'not found' },
    { status: 409, label: 'conflict' },
    { status: 429, label: 'rate limited' },
    { status: 500, label: 'server error' },
    { status: 503, label: 'service unavailable' },
  ];

  for (const { status, label } of cases) {
    for (const locale of LOCALES) {
      it(`produces a non-empty, jargon-free message for ${label} (${status}) in ${locale}`, () => {
        const err = appError({ status });
        const explained = explainError(err, { locale });
        expect(explained.message.length).toBeGreaterThan(0);
        expect(explained.message).not.toMatch(/edge function|non-2xx/i);
        expect(explained.details).toMatchObject({ functionName: 'cvr-search', status });
      });
    }
  }
});

describe('explainError — 400/422 prefers the server\'s own explanation', () => {
  it('uses serverMessage when present and safe', () => {
    const err = appError({ status: 422, serverMessage: 'CVR number must be 8 digits' });
    const explained = explainError(err, { locale: 'da' });
    expect(explained.message).toContain('CVR number must be 8 digits');
  });

  it('falls back to a generic explanation when there is no serverMessage', () => {
    const err = appError({ status: 400 });
    const explained = explainError(err, { locale: 'en' });
    expect(explained.message.length).toBeGreaterThan(0);
  });

  it('ignores a serverMessage that itself contains the banned SDK phrasing', () => {
    const err = appError({ status: 400, serverMessage: 'Edge Function returned a non-2xx status code' });
    const explained = explainError(err, { locale: 'en' });
    expect(explained.message).not.toMatch(/edge function|non-2xx/i);
  });
});

describe('explainError — network and unknown kinds', () => {
  it('explains a network-kind AppError (offline / fetch failure)', () => {
    const err = appError({ kind: 'network' });
    for (const locale of LOCALES) {
      const explained = explainError(err, { locale });
      expect(explained.message.length).toBeGreaterThan(0);
    }
  });

  it('explains a relay-kind AppError as an infrastructure-side problem', () => {
    const err = appError({ kind: 'relay', status: 503 });
    const explained = explainError(err, { locale: 'da' });
    expect(explained.message.length).toBeGreaterThan(0);
  });

  it('explains a plain Error (non-AppError) without crashing', () => {
    const explained = explainError(new Error('Something broke'), { locale: 'da' });
    expect(explained.message).toContain('Something broke');
  });

  it('explains an unknown/non-object thrown value', () => {
    const explained = explainError('a raw string', { locale: 'en' });
    expect(explained.message.length).toBeGreaterThan(0);
  });
});

describe('explainError — function area names', () => {
  it('resolves a known function to its registered area name', () => {
    const err = appError({ functionName: 'cvr-search', status: 500 });
    const explainedDa = explainError(err, { locale: 'da' });
    const explainedEn = explainError(err, { locale: 'en' });
    expect(explainedDa.message).toMatch(/CVR/);
    expect(explainedEn.message).toMatch(/CVR/);
  });

  it('falls back to the raw function slug for an unregistered function', () => {
    const err = appError({ functionName: 'totally-unknown-fn', status: 500 });
    const explained = explainError(err, { locale: 'en' });
    expect(explained.message).toMatch(/totally-unknown-fn/i);
  });
});

describe('explainError — action context and details', () => {
  it('includes the provided action phrase in the message', () => {
    const err = appError({ status: 500 });
    const explained = explainError(err, { locale: 'da', action: 'hente CVR-oplysninger' });
    expect(explained.message).toMatch(/hente CVR-oplysninger/i);
  });

  it('carries functionName, status, requestId and timestamp in details for the "Show details" panel', () => {
    const err = appError({ status: 404, requestId: 'req-abc' });
    const explained = explainError(err, { locale: 'en' });
    expect(explained.details).toMatchObject({ functionName: 'cvr-search', status: 404, requestId: 'req-abc' });
    expect(explained.details.timestamp).toBeTruthy();
  });
});
