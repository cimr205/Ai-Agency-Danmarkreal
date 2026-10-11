import { useEffect } from 'react';
import { createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import {
  isExpectedError,
  moduleFromPath,
  scrubDataBag,
  scrubSpanDescription,
  scrubString,
  scrubUrl,
  scrubValue,
} from '@/lib/sentryScrub';

/**
 * Error monitoring only — Sentry observes, it never changes app behaviour.
 *
 * Everything is driven by environment variables; with no DSN the SDK is never
 * initialised and every helper below is a no-op, so local dev, tests and
 * preview builds without the variable behave exactly as before.
 *
 *   VITE_SENTRY_DSN                 required to enable
 *   VITE_SENTRY_ENVIRONMENT         optional, defaults to the Vercel env / Vite mode
 *   VITE_SENTRY_RELEASE             optional, defaults to the build's git SHA
 *   VITE_SENTRY_TRACES_SAMPLE_RATE  optional, defaults to 0.05
 */

declare const __SENTRY_RELEASE__: string | undefined;
declare const __SENTRY_ENVIRONMENT__: string | undefined;

const DEFAULT_TRACES_SAMPLE_RATE = 0.05;

let enabled = false;

export function isSentryEnabled(): boolean {
  return enabled;
}

function parseSampleRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

function resolveRelease(): string | undefined {
  const fromEnv = import.meta.env.VITE_SENTRY_RELEASE as string | undefined;
  if (fromEnv) return fromEnv;
  return typeof __SENTRY_RELEASE__ === 'string' && __SENTRY_RELEASE__ ? __SENTRY_RELEASE__ : undefined;
}

function resolveEnvironment(): string {
  const fromEnv = import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined;
  if (fromEnv) return fromEnv;
  if (typeof __SENTRY_ENVIRONMENT__ === 'string' && __SENTRY_ENVIRONMENT__) return __SENTRY_ENVIRONMENT__;
  return import.meta.env.MODE;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || enabled) return;

  Sentry.init({
    dsn,
    environment: resolveEnvironment(),
    release: resolveRelease(),

    // The SDK's defaults are "collect everything"; turn every category off.
    // What little context we want (opaque user/company ids, module) is set
    // explicitly below.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },

    integrations: (defaults) => [
      // Console output regularly contains row data and provider responses,
      // so the console integration is removed entirely.
      ...defaults.filter((integration) => integration.name !== 'Console'),
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      // Session Replay is intentionally NOT installed: it would record
      // customer records, inboxes and invoices rendered on screen.
    ],

    tracesSampleRate: parseSampleRate(
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE as string | undefined,
      DEFAULT_TRACES_SAMPLE_RATE,
    ),
    // Do not add sentry-trace/baggage headers to any outgoing request. The
    // edge functions' CORS allow-list does not include them, so propagating
    // would make browsers reject calls to Supabase.
    tracePropagationTargets: [],

    ignoreErrors: [
      // Benign browser noise.
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Stale chunk after a deploy — already auto-recovered by chunkErrorRecovery.
      /Failed to fetch dynamically imported module/i,
      /error loading dynamically imported module/i,
      /Importing a module script failed/i,
      /Unable to preload CSS/i,
      // The user navigated away / cancelled.
      'AbortError',
    ],
    denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-(web-)?extension:\/\//i],

    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console') return null;
      if (breadcrumb.message) breadcrumb.message = scrubString(breadcrumb.message);
      breadcrumb.data = scrubDataBag(breadcrumb.data);
      return breadcrumb;
    },

    beforeSend(event) {
      return scrubEvent(event);
    },

    // Spans are streamed individually in this SDK version, so this — not
    // beforeSendTransaction — is where tracing data is scrubbed.
    beforeSendSpan(span) {
      span.name = scrubSpanDescription(span.name);
      span.attributes = scrubDataBag(span.attributes) as typeof span.attributes;
      return span;
    },
  });

  enabled = true;
}

// Generic over the event type so it serves both error events and transactions.
function scrubEvent<T extends Sentry.Event>(event: T): T {
  if (event.request) {
    event.request = {
      url: event.request.url ? scrubUrl(event.request.url) : undefined,
      headers: event.request.headers?.['User-Agent']
        ? { 'User-Agent': event.request.headers['User-Agent'] }
        : undefined,
    };
  }

  // Opaque ids only — never email, name or IP.
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;

  if (event.message) event.message = scrubString(event.message);
  if (event.transaction) event.transaction = scrubUrl(event.transaction);

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubString(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      // Local variable capture is off in the browser SDK, but be explicit.
      delete frame.vars;
    }
  }

  if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra;
  if (event.contexts) {
    for (const [name, context] of Object.entries(event.contexts)) {
      // `trace`, `react`, `browser`, `os`, `device` are SDK-generated metadata.
      if (name === 'trace') continue;
      event.contexts[name] = scrubValue(context) as typeof context;
    }
  }

  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = scrubString(breadcrumb.message);
    breadcrumb.data = scrubDataBag(breadcrumb.data);
  }

  for (const span of event.spans ?? []) {
    if (span.description) span.description = scrubSpanDescription(span.description);
    if (span.data) span.data = scrubDataBag(span.data) as typeof span.data;
  }

  if (typeof window !== 'undefined') {
    event.tags = { module: moduleFromPath(window.location.pathname), ...event.tags };
  }

  return event;
}

export interface ReportContext {
  /** Business module; defaults to the one derived from the current route. */
  module?: string;
  /** Short machine-readable description of what was being attempted. */
  action?: string;
  /** Non-sensitive identifiers only (ids, counts, statuses). Scrubbed again before sending. */
  extra?: Record<string, unknown>;
}

/**
 * Supabase returns PostgrestError / FunctionsHttpError shapes that are plain
 * objects, which Sentry would group as "Object captured as exception". Turn
 * them into real Errors, and deliberately leave out `details` — Postgres puts
 * the offending row values there (`Key (email)=(…) already exists`).
 */
function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown; name?: unknown };
    const wrapped = new Error(typeof e.message === 'string' ? e.message : 'Unknown error');
    wrapped.name =
      typeof e.name === 'string' ? e.name : typeof e.code === 'string' ? `PostgrestError(${e.code})` : 'NonErrorObject';
    return wrapped;
  }
  return new Error(typeof error === 'string' ? error : 'Unknown error');
}

/**
 * Report a handled application error. Expected outcomes (validation, 4xx,
 * permission denials, bad credentials) are dropped here so call sites can
 * report unconditionally next to their existing toast/console handling.
 */
export function reportError(error: unknown, context: ReportContext = {}): void {
  if (!enabled || isExpectedError(error)) return;

  Sentry.withScope((scope) => {
    if (context.module) scope.setTag('module', context.module);
    if (context.action) scope.setTag('action', context.action);
    scope.setTag('handled_by', 'app');
    if (context.extra) scope.setExtras(context.extra);
    Sentry.captureException(toError(error));
  });
}

/** Reports a render crash caught by the app's own ErrorBoundary. */
export function reportBoundaryError(error: Error, componentStack: string | null | undefined): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    scope.setTag('handled_by', 'error_boundary');
    if (componentStack) scope.setContext('react', { componentStack });
    Sentry.captureException(error);
  });
}

/** Attach the signed-in user as opaque ids. Email and name are never sent. */
export function setSentryUser(user: { user_id: string; company_id: string | null } | null): void {
  if (!enabled) return;
  if (!user) {
    Sentry.setUser(null);
    Sentry.setTag('company_id', undefined);
    return;
  }
  Sentry.setUser({ id: user.user_id });
  Sentry.setTag('company_id', user.company_id ?? undefined);
}

/** `<Routes>` wrapper that gives transactions parameterised names (`/:locale/app/clients/:id`). */
export const withSentryRouting = Sentry.withSentryReactRouterV7Routing;
