import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDevicePlatform,
  getExpectedHandoffMethod,
  getTelephoneUri,
  normalizePhoneNumber,
  tryAndroidNativeDialer,
} from './deviceDialer';

afterEach(() => {
  delete window.AndroidPowerDialer;
  vi.restoreAllMocks();
});

describe('device dialer handoff', () => {
  it('normalizes formatted international phone numbers', () => {
    expect(normalizePhoneNumber('+45 12 34 56 78')).toBe('+4512345678');
    expect(getTelephoneUri('+45 (12) 34-56-78')).toBe('tel:+4512345678');
  });

  it('rejects values that cannot be phone numbers', () => {
    expect(normalizePhoneNumber('N/A')).toBe('');
    expect(getTelephoneUri('12')).toBe('');
  });

  it('detects Android and Apple mobile devices', () => {
    expect(getDevicePlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android');
    expect(getDevicePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(getDevicePlatform('Mozilla/5.0', 'MacIntel', 5)).toBe('ios');
  });

  it('falls back to the web platform on desktop', () => {
    expect(getDevicePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'MacIntel', 0)).toBe('web');
  });

  it('uses the optional Android ACTION_DIAL bridge with a normalized number', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15; Pixel 9)');
    const openDialer = vi.fn();
    window.AndroidPowerDialer = { openDialer };

    expect(getExpectedHandoffMethod()).toBe('android_native');
    expect(tryAndroidNativeDialer('+45 12 34 56 78')).toBe(true);
    expect(openDialer).toHaveBeenCalledWith('+4512345678');
  });

  it('uses a tel URI when no native Android bridge is available', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15; Pixel 9)');

    expect(getExpectedHandoffMethod()).toBe('system_tel');
    expect(tryAndroidNativeDialer('+45 12 34 56 78')).toBe(false);
    expect(getTelephoneUri('+45 12 34 56 78')).toBe('tel:+4512345678');
  });

  it('always respects the iPhone system tel flow even if a bridge-shaped object exists', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    window.AndroidPowerDialer = { openDialer: vi.fn() };

    expect(getExpectedHandoffMethod()).toBe('system_tel');
    expect(tryAndroidNativeDialer('+45 12 34 56 78')).toBe(false);
    expect(window.AndroidPowerDialer.openDialer).not.toHaveBeenCalled();
  });
});
