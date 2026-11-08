import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke } },
}));

// Imported after the mock so invokeFunction's internal `supabase` binding is the mock.
const { invokeFunction, AppError } = await import('@/lib/functions');

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function catchAppError(promise: Promise<unknown>): Promise<InstanceType<typeof AppError>> {
  try {
    await promise;
  } catch (e) {
    return e as InstanceType<typeof AppError>;
  }
  throw new Error('expected promise to reject');
}

describe('invokeFunction', () => {
  beforeEach(() => invoke.mockReset());

  it('returns the data on success', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(invokeFunction('cvr-search')).resolves.toEqual({ ok: true });
  });

  it('reads the response body and throws an AppError with functionName, status, serverMessage, code, hint and requestId on a FunctionsHttpError', async () => {
    const response = jsonResponse(422, {
      error: 'Invalid CVR number',
      code: 'invalid_cvr',
      hint: 'Use 8 digits',
      requestId: 'req-123',
    });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });

    const err = await catchAppError(invokeFunction('cvr-search'));
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({
      functionName: 'cvr-search',
      status: 422,
      serverMessage: 'Invalid CVR number',
      code: 'invalid_cvr',
      hint: 'Use 8 digits',
      requestId: 'req-123',
      kind: 'http',
    });
    expect(err.timestamp).toBeTruthy();
  });

  it('also accepts request_id (snake_case) from the body', async () => {
    const response = jsonResponse(500, { error: 'boom', request_id: 'req-snake' });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });

    const err = await catchAppError(invokeFunction('ai-generate'));
    expect(err.requestId).toBe('req-snake');
  });

  it('falls back gracefully when the error body is not valid JSON', async () => {
    const response = new Response('<html>Gateway error</html>', { status: 502 });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });

    const err = await catchAppError(invokeFunction('ai-generate'));
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(502);
    expect(err.serverMessage).toBeUndefined();
    expect(err.kind).toBe('http');
  });

  it('throws a network-kind AppError on FunctionsFetchError (offline / fetch failure)', async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) });

    const err = await catchAppError(invokeFunction('meta-sync'));
    expect(err).toBeInstanceOf(AppError);
    expect(err.kind).toBe('network');
    expect(err.functionName).toBe('meta-sync');
  });

  it('throws a relay-kind AppError on FunctionsRelayError', async () => {
    const response = new Response(null, { status: 503 });
    invoke.mockResolvedValue({ data: null, error: new FunctionsRelayError(response) });

    const err = await catchAppError(invokeFunction('workflow-runner'));
    expect(err).toBeInstanceOf(AppError);
    expect(err.kind).toBe('relay');
    expect(err.status).toBe(503);
  });

  it('carries the full parsed body on AppError.body for callers that need a custom field', async () => {
    const response = jsonResponse(400, { error: 'degraded', fallback: true, extra: 'x' });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });

    const err = await catchAppError(invokeFunction('voice-telephony'));
    expect(err.body).toMatchObject({ error: 'degraded', fallback: true, extra: 'x' });
  });
});
