import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import ColdCallerPage from './ColdCallerPage';

const logCall = vi.fn();

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
  logCall.mockReset();
  logCall.mockResolvedValue('new-call-id');
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
    expect(screen.getByText('Your own number is used automatically')).toBeInTheDocument();
    expect(screen.getByText('No connection required')).toBeInTheDocument();
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
        platform: 'web',
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
});
