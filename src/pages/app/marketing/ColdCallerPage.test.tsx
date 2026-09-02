import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import ColdCallerPage from './ColdCallerPage';

const logCall = vi.fn();
const createPairingSession = vi.fn();
let phoneDevices: Array<Record<string, unknown>> = [];

const leads = [
  {
    id: 'lead-poul',
    name: 'Poul Jensen',
    company_name: 'Poul ApS',
    email: 'poul@example.com',
    phone: '+45 12 34 56 78',
    notes: 'Asked about the enterprise plan.',
  },
  {
    id: 'lead-no-phone',
    name: 'No Phone',
    company_name: 'Silent ApS',
    email: 'silent@example.com',
    phone: null,
    notes: null,
  },
  {
    id: 'lead-anna',
    name: 'Anna Meyer',
    company_name: 'Anna GmbH',
    email: 'anna@example.com',
    phone: '+49 30 123456',
    notes: null,
  },
];

const recentCalls = [
  {
    id: 'call-1',
    lead_id: 'lead-poul',
    phone_number: '+4512345678',
    outcome: 'no_answer',
    dialed_at: new Date().toISOString(),
    callback_at: null,
    lead: { id: 'lead-poul', name: 'Poul Jensen', company_name: 'Poul ApS', phone: '+4512345678' },
  },
];

vi.mock('@/hooks/api/useLeads', () => ({
  useLeads: () => ({ data: { data: leads }, isLoading: false }),
}));

vi.mock('@/hooks/api/usePowerDialer', () => ({
  usePowerDialerCalls: () => ({
    data: recentCalls,
    isLoading: false,
    error: null,
  }),
  useLogPowerDialerCall: () => ({
    mutateAsync: logCall,
    isPending: false,
  }),
}));

vi.mock('@/hooks/api/usePhoneDeviceRelay', () => ({
  usePhoneDevices: () => ({ data: phoneDevices, error: null }),
  useCreatePhonePairingSession: () => ({ data: null, isPending: false, mutate: createPairingSession }),
  useRevokePhoneDevice: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCreatePhoneCallCommand: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter>
      <I18nProvider locale="en">
        <ColdCallerPage />
      </I18nProvider>
    </MemoryRouter>,
  );
}

function getCallLink(phoneNumber: string) {
  return document.querySelector<HTMLAnchorElement>(`a[href="tel:${phoneNumber}"]`);
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  });
  window.localStorage.setItem('crm-power-dialer-phone-v1', JSON.stringify({
    version: 1,
    deviceId: 'iphone-test-device',
    phoneNumber: '+4511223344',
    platform: 'ios',
    connectedAt: new Date().toISOString(),
  }));
  logCall.mockReset();
  logCall.mockResolvedValue('new-call-id');
  createPairingSession.mockReset();
  phoneDevices = [];
});

describe('Device Power Dialer page', () => {
  it('builds its queue only from existing callable CRM leads and hands off with tel:', () => {
    renderPage();

    const callLink = getCallLink('+4512345678');
    expect(callLink).toBeInTheDocument();
    expect(screen.getAllByText('Poul Jensen').length).toBeGreaterThan(0);
    expect(screen.getByText('Anna Meyer')).toBeInTheDocument();
    expect(screen.queryByText('No Phone')).not.toBeInTheDocument();
    expect(screen.queryByText(/Twilio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/keypad/i)).not.toBeInTheDocument();
    expect(screen.getByText('Phone connected')).toBeInTheDocument();
    expect(screen.getByText('+4511223344')).toBeInTheDocument();
  });

  it('stores the handoff, logs one of four outcomes, and advances to the next lead', async () => {
    renderPage();

    const callLink = getCallLink('+4512345678');
    expect(callLink).not.toBeNull();
    callLink?.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(callLink as HTMLAnchorElement);

    expect(window.sessionStorage.getItem('crm-power-dialer-pending-v1')).toContain('lead-poul');
    expect(screen.getByRole('button', { name: 'No answer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Callback' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Interested' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not interested' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Interested' }));
    fireEvent.change(screen.getByLabelText('Call notes'), {
      target: { value: 'Send enterprise proposal.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save & next/i }));

    await waitFor(() => {
      expect(logCall).toHaveBeenCalledWith(expect.objectContaining({
        leadId: 'lead-poul',
        phoneNumber: '+45 12 34 56 78',
        outcome: 'interested',
        notes: 'Send enterprise proposal.',
        callbackAt: null,
        platform: 'ios',
        handoffMethod: 'system_tel',
      }));
    });
    await waitFor(() => expect(getCallLink('+4930123456')).toBeInTheDocument());
    expect(window.sessionStorage.getItem('crm-power-dialer-pending-v1')).toBeNull();
  });

  it('restores a pending call after returning from the phone app and saves a callback', async () => {
    const startedAt = Date.now() - 15_000;
    window.sessionStorage.setItem('crm-power-dialer-pending-v1', JSON.stringify({
      version: 1,
      leadId: 'lead-poul',
      startedAt,
      platform: 'ios',
      handoffMethod: 'system_tel',
    }));
    renderPage();

    expect(getCallLink('+4512345678')).not.toBeInTheDocument();
    expect(screen.getByText('Log this call')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Callback' }));
    fireEvent.change(screen.getByLabelText('Callback date and time'), {
      target: { value: '2030-01-02T10:30' },
    });
    fireEvent.change(screen.getByLabelText('Call notes'), {
      target: { value: 'Call after the board meeting.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save & next/i }));

    await waitFor(() => {
      expect(logCall).toHaveBeenCalledWith(expect.objectContaining({
        leadId: 'lead-poul',
        outcome: 'callback',
        notes: 'Call after the board meeting.',
        callbackAt: new Date('2030-01-02T10:30').toISOString(),
        platform: 'ios',
        handoffMethod: 'system_tel',
      }));
    });
  });

  it('shows recent persisted call history', () => {
    renderPage();

    expect(screen.getByText('Recent call outcomes')).toBeInTheDocument();
    expect(screen.getByText('No answer')).toBeInTheDocument();
  });

  it('connects an iPhone number locally before enabling the call action', () => {
    window.localStorage.clear();
    renderPage();

    expect(getCallLink('+4512345678')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Your own mobile number'), {
      target: { value: '+45 20 30 40 50' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect this phone' }));

    expect(getCallLink('+4512345678')).toBeInTheDocument();
    expect(window.localStorage.getItem('crm-power-dialer-phone-v1')).toContain('+4520304050');
    expect(screen.getByText('Phone connected')).toBeInTheDocument();
  });

  it('starts secure desktop pairing without unlocking calls from a checklist', () => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    });
    renderPage();

    expect(screen.getByText('Connect a nearby phone')).toBeInTheDocument();
    expect(screen.getByText('Mac + iPhone')).toBeInTheDocument();
    expect(screen.getByText('Mac + Android')).toBeInTheDocument();
    expect(screen.getByText('Windows + iPhone')).toBeInTheDocument();
    expect(screen.getByText('Windows + Android')).toBeInTheDocument();
    expect(getCallLink('+4512345678')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start secure pairing' }));

    expect(createPairingSession).toHaveBeenCalledOnce();
    expect(getCallLink('+4512345678')).not.toBeInTheDocument();
  });

  it('unlocks desktop calling only when the backend reports a fresh phone heartbeat', async () => {
    window.localStorage.clear();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    });
    phoneDevices = [{
      id: 'verified-android',
      display_name: 'Sales Android',
      platform: 'android',
      status: 'online',
      paired_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    }];
    renderPage();

    await waitFor(() => expect(getCallLink('+4512345678')).toBeInTheDocument());
    expect(screen.getByText('Verified phone online')).toBeInTheDocument();
    expect(screen.getByText(/Sales Android/)).toBeInTheDocument();
  });
});
