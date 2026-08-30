export type DevicePlatform = 'android' | 'ios' | 'web';
export type DialHandoffMethod = 'android_native' | 'system_tel';

declare global {
  interface Window {
    AndroidPowerDialer?: {
      openDialer: (phoneNumber: string) => void;
    };
  }
}

export function normalizePhoneNumber(phoneNumber: string): string {
  const trimmed = phoneNumber.trim();
  const hasInternationalPrefix = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  if (digits.length < 3) return '';
  return `${hasInternationalPrefix ? '+' : ''}${digits}`;
}

export function getDevicePlatform(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
  maxTouchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
): DevicePlatform {
  if (/android/i.test(userAgent)) return 'android';

  const isAppleMobile = /iPhone|iPad|iPod/i.test(userAgent);
  const isIPadDesktopMode = platform === 'MacIntel' && maxTouchPoints > 1;
  if (isAppleMobile || isIPadDesktopMode) return 'ios';

  return 'web';
}

export function getTelephoneUri(phoneNumber: string): string {
  const normalized = normalizePhoneNumber(phoneNumber);
  return normalized ? `tel:${normalized}` : '';
}

/**
 * Uses an Android host bridge when the web app is embedded in a native shell.
 * The host implementation must open ACTION_DIAL, not ACTION_CALL, so the user
 * remains in control and no CALL_PHONE permission is needed.
 */
export function tryAndroidNativeDialer(phoneNumber: string): boolean {
  if (typeof window === 'undefined' || getDevicePlatform() !== 'android') return false;

  const normalized = normalizePhoneNumber(phoneNumber);
  const bridge = window.AndroidPowerDialer;
  if (!normalized || !bridge?.openDialer) return false;

  bridge.openDialer(normalized);
  return true;
}

export function getExpectedHandoffMethod(): DialHandoffMethod {
  return typeof window !== 'undefined' &&
    getDevicePlatform() === 'android' &&
    Boolean(window.AndroidPowerDialer?.openDialer)
    ? 'android_native'
    : 'system_tel';
}
