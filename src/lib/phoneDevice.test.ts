import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONNECTED_PHONE_KEY,
  connectPhone,
  disconnectPhone,
  getPhonePairingUrl,
  loadConnectedPhone,
} from './phoneDevice';

describe('phone device pairing', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, '', '/da/app/marketing/cold-caller');
  });

  it('connects and restores an iPhone using a normalized local number', () => {
    const phone = connectPhone('+45 20 30 40 50', 'ios');

    expect(phone).toMatchObject({ phoneNumber: '+4520304050', platform: 'ios' });
    expect(loadConnectedPhone()).toEqual(phone);
    expect(window.localStorage.getItem(CONNECTED_PHONE_KEY)).toContain('+4520304050');
  });

  it('does not claim that a desktop browser is a connected SIM device', () => {
    expect(connectPhone('+45 20 30 40 50', 'web')).toBeNull();
    expect(loadConnectedPhone()).toBeNull();
  });

  it('disconnects the phone and creates the mobile QR destination', () => {
    connectPhone('+45 20 30 40 50', 'android');
    disconnectPhone();

    expect(loadConnectedPhone()).toBeNull();
    expect(getPhonePairingUrl('da')).toBe('http://localhost:3000/da/app/marketing/cold-caller?connectPhone=1');
  });

  it('rejects malformed stored data', () => {
    window.localStorage.setItem(CONNECTED_PHONE_KEY, '{"version":2}');
    expect(loadConnectedPhone()).toBeNull();
    expect(window.localStorage.getItem(CONNECTED_PHONE_KEY)).toBeNull();
  });
});
