import { normalizePhoneNumber, type DevicePlatform } from '@/lib/deviceDialer';

const CONNECTED_PHONE_KEY = 'crm-power-dialer-phone-v1';

export interface ConnectedPhone {
  version: 1;
  deviceId: string;
  phoneNumber: string;
  platform: Exclude<DevicePlatform, 'web'>;
  connectedAt: string;
}

export function loadConnectedPhone(): ConnectedPhone | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(CONNECTED_PHONE_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<ConnectedPhone>;
    if (
      value.version !== 1 ||
      typeof value.deviceId !== 'string' ||
      typeof value.phoneNumber !== 'string' ||
      !['android', 'ios'].includes(value.platform ?? '') ||
      typeof value.connectedAt !== 'string'
    ) {
      window.localStorage.removeItem(CONNECTED_PHONE_KEY);
      return null;
    }
    return value as ConnectedPhone;
  } catch {
    window.localStorage.removeItem(CONNECTED_PHONE_KEY);
    return null;
  }
}

export function connectPhone(phoneNumber: string, platform: DevicePlatform): ConnectedPhone | null {
  if (typeof window === 'undefined' || platform === 'web') return null;
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) return null;

  const connectedPhone: ConnectedPhone = {
    version: 1,
    deviceId: window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    phoneNumber: normalized,
    platform,
    connectedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(CONNECTED_PHONE_KEY, JSON.stringify(connectedPhone));
  return connectedPhone;
}

export function disconnectPhone() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(CONNECTED_PHONE_KEY);
}

export function getPhonePairingUrl(locale: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/${locale}/app/marketing/cold-caller?connectPhone=1`;
}

export { CONNECTED_PHONE_KEY };
