import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const captureException = vi.fn();
const scope = { setTag: vi.fn(), setExtras: vi.fn(), setContext: vi.fn() };

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: (...args: unknown[]) => captureException(...args),
  withScope: (callback: (s: typeof scope) => void) => callback(scope),
  setUser: vi.fn(),
  setTag: vi.fn(),
  reactRouterV7BrowserTracingIntegration: vi.fn(() => ({ name: 'ReactRouterTracing' })),
  withSentryReactRouterV7Routing: (component: unknown) => component,
}));

function Crash(): never {
  throw new Error('render exploded');
}

describe('Sentry wiring', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    captureException.mockClear();
    Object.values(scope).forEach((fn) => fn.mockClear());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('is completely inert without a DSN', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const Sentry = await import('@sentry/react');
    const { initSentry, isSentryEnabled, reportError } = await import('@/lib/sentry');
    const { ErrorBoundary } = await import('@/components/ErrorBoundary');

    initSentry();
    reportError(new Error('boom'));
    render(<ErrorBoundary><Crash /></ErrorBoundary>);

    expect(isSentryEnabled()).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    // The existing fallback UI still renders.
    expect(screen.getByText('errorBoundary.title')).toBeInTheDocument();
  });

  it('initialises with replay off, PII collection off and no trace header propagation', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o1.ingest.de.sentry.io/1');
    const Sentry = await import('@sentry/react');
    const { initSentry } = await import('@/lib/sentry');
    initSentry();

    const options = vi.mocked(Sentry.init).mock.calls.at(-1)![0]!;
    expect(options.dsn).toBe('https://key@o1.ingest.de.sentry.io/1');
    expect(options.tracesSampleRate).toBe(0.05);
    expect(options.tracePropagationTargets).toEqual([]);
    expect(options).not.toHaveProperty('replaysSessionSampleRate');
    expect(options).not.toHaveProperty('replaysOnErrorSampleRate');
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    });
    const integrations = (options.integrations as (defaults: { name: string }[]) => { name: string }[])([
      { name: 'Breadcrumbs' },
      { name: 'Console' },
      { name: 'GlobalHandlers' },
    ]).map((integration) => integration.name);
    expect(integrations).toEqual(['Breadcrumbs', 'GlobalHandlers', 'ReactRouterTracing']);
    expect(integrations.some((name) => /replay/i.test(name))).toBe(false);
  });

  it('reports a render crash caught by the existing ErrorBoundary', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o1.ingest.de.sentry.io/1');
    const { initSentry } = await import('@/lib/sentry');
    const { ErrorBoundary } = await import('@/components/ErrorBoundary');
    initSentry();

    render(<ErrorBoundary><Crash /></ErrorBoundary>);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect((captureException.mock.calls[0][0] as Error).message).toBe('render exploded');
    expect(scope.setTag).toHaveBeenCalledWith('handled_by', 'error_boundary');
    expect(screen.getByText('errorBoundary.title')).toBeInTheDocument();
  });

  it('reports real failures but not validation or permission outcomes', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://key@o1.ingest.de.sentry.io/1');
    const { initSentry, reportError } = await import('@/lib/sentry');
    initSentry();

    reportError({ code: '23505', message: 'duplicate key value', details: 'Key (email)=(a@b.dk) already exists.' });
    reportError({ name: 'AuthApiError', status: 400, message: 'Invalid login credentials' });
    reportError({ name: 'FunctionsHttpError', context: { status: 422 } });
    expect(captureException).not.toHaveBeenCalled();

    reportError(
      { code: '42P01', message: 'relation "invoices" does not exist', details: 'row for a@b.dk' },
      { module: 'invoices', action: 'create_invoice' },
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    const sent = captureException.mock.calls[0][0] as Error;
    expect(sent).toBeInstanceOf(Error);
    expect(sent.name).toBe('PostgrestError(42P01)');
    // Postgres `details` (row values) is never forwarded.
    expect(JSON.stringify({ ...sent, message: sent.message })).not.toContain('a@b.dk');
    expect(scope.setTag).toHaveBeenCalledWith('module', 'invoices');
    expect(scope.setTag).toHaveBeenCalledWith('action', 'create_invoice');
  });
});
