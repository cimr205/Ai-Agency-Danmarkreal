import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '@/lib/errors';
import { describeAuthError } from '@/lib/authErrors';

// Regression guard: err instanceof Error ? err.message : fallback always
// discarded Supabase's PostgrestError (not an Error instance), hiding real
// database errors behind a generic fallback across ~40 files this session.
describe('getErrorMessage', () => {
  it('extracts message from a real Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('extracts message from a plain object with a message field (PostgrestError shape)', () => {
    expect(getErrorMessage({ message: 'permission denied for table profiles', code: '42501' })).toBe(
      'permission denied for table profiles'
    );
  });

  it('returns an empty string for a string message field that is empty (falsy, so `|| fallback` still works)', () => {
    expect(getErrorMessage({ message: '' })).toBe('');
  });

  it('returns undefined for values with no usable message', () => {
    expect(getErrorMessage(null)).toBeUndefined();
    expect(getErrorMessage(undefined)).toBeUndefined();
    expect(getErrorMessage('a raw string')).toBeUndefined();
    expect(getErrorMessage({ code: '42501' })).toBeUndefined();
  });
});

describe('describeAuthError', () => {
  const t = (key: string) => `[${key}]`;

  it('maps "email not confirmed" to a translated key regardless of case', () => {
    expect(describeAuthError(new Error('Email not confirmed'), t)).toBe('[auth.emailNotConfirmed]');
  });

  it('maps "invalid login credentials" to a translated key', () => {
    expect(describeAuthError(new Error('Invalid login credentials'), t)).toBe('[auth.invalidCredentials]');
  });

  it('falls back to the raw message for unrecognized errors', () => {
    expect(describeAuthError(new Error('Some unmapped GoTrue error'), t)).toBe('Some unmapped GoTrue error');
  });

  it('falls back to the translated unknown-error key when there is no message at all', () => {
    expect(describeAuthError({}, t)).toBe('[auth.unknownError]');
  });
});
