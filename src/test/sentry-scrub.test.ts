import { describe, it, expect } from 'vitest';
import {
  isExpectedError,
  moduleFromPath,
  scrubDataBag,
  scrubSpanDescription,
  scrubString,
  scrubUrl,
  scrubValue,
} from '@/lib/sentryScrub';

// Guards the promise that no credentials or customer data reach Sentry.
describe('scrubString', () => {
  it('removes email addresses', () => {
    expect(scrubString('duplicate key (email)=(anna@kunde.dk) already exists')).toBe(
      'duplicate key (email)=([email]) already exists',
    );
  });

  it('removes JWTs and bearer tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(scrubString(`token ${jwt} rejected`)).toBe('token [jwt] rejected');
    expect(scrubString('Authorization: Bearer abcdef1234567890')).toBe('Authorization: Bearer [token]');
  });

  it('removes provider API keys', () => {
    // Assembled at runtime so no key-shaped literal lives in the repo.
    const stripeKey = ['sk', 'live', 'a1B2c3D4e5F6g7H8i9J0'].join('_');
    const webhookSecret = ['whsec', 'a1B2c3D4e5F6g7H8'].join('_');
    expect(scrubString(`Invalid API Key provided: ${stripeKey}`)).toBe('Invalid API Key provided: [key]');
    expect(scrubString(`secret ${webhookSecret}`)).toBe('secret [key]');
  });

  it('removes card-shaped digit runs and long hex secrets', () => {
    expect(scrubString('card 4242 4242 4242 4242 declined')).toBe('card [number] declined');
    expect(scrubString('hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')).toBe('hash [hex]');
  });

  it('leaves ordinary messages and uuids intact', () => {
    const message = 'invoice 3f2504e0-4f89-41d3-9a0c-0305e82c3301 not found';
    expect(scrubString(message)).toBe(message);
  });
});

describe('scrubUrl', () => {
  it('drops OAuth codes, tokens and PostgREST filters', () => {
    expect(scrubUrl('https://app.example.dk/da/auth/callback?code=abc123#access_token=xyz')).toBe(
      'https://app.example.dk/da/auth/callback',
    );
    expect(scrubUrl('https://x.supabase.co/rest/v1/customers?email=eq.anna@kunde.dk&select=*')).toBe(
      'https://x.supabase.co/rest/v1/customers',
    );
  });
});

describe('scrubValue', () => {
  it('filters sensitive keys at any depth and scrubs remaining strings', () => {
    expect(
      scrubValue({
        invoiceId: 'inv_1',
        password: 'hunter2',
        nested: { access_token: 'abc', apiKey: 'k', note: 'contact anna@kunde.dk', email_body: '<p>hej</p>' },
      }),
    ).toEqual({
      invoiceId: 'inv_1',
      password: '[Filtered]',
      nested: { access_token: '[Filtered]', apiKey: '[Filtered]', note: 'contact [email]', email_body: '[Filtered]' },
    });
  });
});

describe('scrubDataBag / scrubSpanDescription', () => {
  it('strips query strings from breadcrumb and span urls and drops bodies', () => {
    expect(
      scrubDataBag({
        url: 'https://x.supabase.co/functions/v1/gmail-send?to=anna@kunde.dk',
        method: 'POST',
        status_code: 500,
        request_body: '{"subject":"hemmeligt"}',
        'http.query': 'to=anna@kunde.dk',
      }),
    ).toEqual({ url: 'https://x.supabase.co/functions/v1/gmail-send', method: 'POST', status_code: 500 });

    expect(scrubSpanDescription('GET https://x.supabase.co/rest/v1/customers?email=eq.anna@kunde.dk')).toBe(
      'GET https://x.supabase.co/rest/v1/customers',
    );
  });
});

describe('isExpectedError', () => {
  it('treats validation, permission and 4xx outcomes as expected', () => {
    expect(isExpectedError({ code: '23505', message: 'duplicate key' })).toBe(true);
    expect(isExpectedError({ code: '42501', message: 'permission denied' })).toBe(true);
    expect(isExpectedError({ name: 'AuthApiError', status: 400, message: 'Invalid login credentials' })).toBe(true);
    expect(isExpectedError({ name: 'FunctionsHttpError', context: { status: 422 } })).toBe(true);
    expect(isExpectedError({ name: 'ZodError', issues: [] })).toBe(true);
  });

  it('reports real failures', () => {
    expect(isExpectedError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isExpectedError({ code: '42P01', message: 'relation "x" does not exist' })).toBe(false);
    expect(isExpectedError({ name: 'FunctionsHttpError', context: { status: 500 } })).toBe(false);
    expect(isExpectedError({ name: 'FunctionsFetchError', message: 'Failed to send a request' })).toBe(false);
  });
});

describe('moduleFromPath', () => {
  it.each([
    ['/da/app/crm/leads', 'leads'],
    ['/en/app/crm/deals', 'deals'],
    ['/da/app/clients/3f2504e0', 'customers'],
    ['/da/app/finance/invoices', 'invoices'],
    ['/da/app/finance/payments', 'payments'],
    ['/da/app/hr/payroll', 'hr'],
    ['/da/app/email/bulk', 'bulk_email'],
    ['/da/app/work/inbox', 'email'],
    ['/da/app/marketing/meta-ads', 'meta_ads'],
    ['/da/app/pa', 'ai'],
    ['/da/app/settings/invitations', 'invitations'],
    ['/da/auth/login', 'auth'],
    ['/da/auth/join', 'invitations'],
    ['/da', 'public'],
  ])('%s → %s', (path, expected) => {
    expect(moduleFromPath(path)).toBe(expected);
  });
});
