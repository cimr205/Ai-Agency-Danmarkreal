import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONNECTED_PHONE_KEY,
  connectComputerRelay,
  connectPhone,
  disconnectPhone,
  getComputerPlatform,
  getPhonePairingUrl,
  isDialerConnectionReady,
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

  it('does not unlock desktop calling from a local-only checklist relay', () => {
    const phone = connectComputerRelay('mac', 'ios');

    expect(phone).toMatchObject({
      platform: 'web',
      connectionMode: 'computer_relay',
      computerPlatform: 'mac',
      phonePlatform: 'ios',
      phoneNumber: '',
    });
    expect(isDialerConnectionReady(phone, 'web')).toBe(false);
    expect(isDialerConnectionReady(phone, 'ios')).toBe(false);
  });

  it('unlocks desktop calling only for a server-verified online companion', () => {
    expect(isDialerConnectionReady({
      version: 1,
      deviceId: 'verified-device',
      phoneNumber: '',
      platform: 'web',
      connectionMode: 'backend_relay',
      phonePlatform: 'ios',
      status: 'online',
      connectedAt: new Date().toISOString(),
    }, 'web')).toBe(true);
  });

  it('supports Windows relay combinations and rejects Mac plus Android', () => {
    expect(connectComputerRelay('windows', 'android')).toMatchObject({ phonePlatform: 'android' });
    expect(connectComputerRelay('mac', 'android')).toBeNull();
    expect(getComputerPlatform('Mozilla/5.0 (Macintosh)', 'MacIntel')).toBe('mac');
    expect(getComputerPlatform('Mozilla/5.0 (Windows NT 10.0)', 'Win32')).toBe('windows');
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
