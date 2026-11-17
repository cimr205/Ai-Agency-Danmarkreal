import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { I18nProvider, translate } from '@/lib/i18n';

// jsdom has no ResizeObserver; recharts' ResponsiveContainer needs one.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const state = vi.hoisted(() => ({
  conns: [] as unknown[], ga4: [] as unknown[], gsc: [] as unknown[], recs: [] as unknown[], impact: null as unknown,
  roles: [{ role: 'owner', can_grant_permissions: false }], mutate: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { company_id: 'c1' }, roles: state.roles, isSystemAdmin: false }) }));
vi.mock('@/hooks/api/useGrowthAnalytics', () => {
  const q = (data: () => unknown) => () => ({ data: data(), error: null, isLoading: false });
  const m = () => ({ mutate: state.mutate, isPending: false, isSuccess: false, error: null });
  return {
    useAnalyticsConnections: q(() => state.conns), useGa4Daily: q(() => state.ga4), useGa4Landing: q(() => []), useGscDaily: q(() => state.gsc),
    useGscQueryPage: q(() => []), useSeoRecommendations: q(() => state.recs), useBusinessImpact: q(() => state.impact),
    useRequestAnalyticsConnection: m, useSetConnectionStatus: m, useDecideRecommendation: m, useMarkImplemented: m, useRunOpportunities: m,
  };
});

import { AnalyticsDashboard } from './AnalyticsDashboard';

const renderIt = (locale: 'en' | 'da' = 'en') => render(<I18nProvider locale={locale}><AnalyticsDashboard t={(k) => translate(locale, k)} /></I18nProvider>);

beforeEach(() => {
  state.conns = []; state.ga4 = []; state.gsc = []; state.recs = []; state.impact = null; state.mutate.mockReset();
  state.roles = [{ role: 'owner', can_grant_permissions: false }];
});

describe('Growth OS analytics dashboard', () => {
  it('not connected: says so, offers the connection form, and shows no numbers', () => {
    renderIt();
    expect(screen.getAllByText('Not connected').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Request connection' })).toBeInTheDocument();
    expect(screen.queryByText('Organic sessions')).toBeNull();
  });

  it('owner requests a connection with the entered ids', () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('GA4 property ID (digits)'), { target: { value: '533214056' } });
    fireEvent.change(screen.getByLabelText('Search Console site'), { target: { value: 'sc-domain:aiagencydanmark.dk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request connection' }));
    expect(state.mutate).toHaveBeenCalledWith({ ga4PropertyId: '533214056', gscSiteUrl: 'sc-domain:aiagencydanmark.dk' });
  });

  it('employees cannot connect analytics', () => {
    state.roles = [{ role: 'employee', can_grant_permissions: false }];
    renderIt();
    expect(screen.queryByRole('button', { name: 'Request connection' })).toBeNull();
    expect(screen.getByText(/Only the owner or a company admin/)).toBeInTheDocument();
  });

  it('active connection with data shows the synced numbers and the comparison', () => {
    state.conns = [{ company_id: 'c1', status: 'active', ga4_property_id: '533214056', gsc_site_url: null, ga4_synced_through: '2026-11-14', gsc_synced_through: null, last_sync_at: '2026-11-15T00:00:00Z', last_error: null, requested_at: '', approved_at: '' }];
    state.ga4 = [
      { day: '2026-11-10', channel_group: 'Organic Search', sessions: 30, active_users: 25, engaged_sessions: 20, key_events: 2 },
      { day: '2026-10-01', channel_group: 'Organic Search', sessions: 20, active_users: 18, engaged_sessions: 10, key_events: 0 },
    ];
    renderIt();
    expect(screen.getAllByText('Organic sessions').length).toBeGreaterThan(0);
    expect(screen.getAllByText('30').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+50\.0% vs previous 28 days/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Request connection' })).toBeNull();
  });

  it('business impact never shows attributed revenue when leads have no source', () => {
    state.impact = { leads_total: 12, leads_without_source: 12, leads_organic: 0, leads_organic_converted: 0, paying_customers_total: 3, paying_customers_organic: 0, revenue_organic: 0 };
    renderIt();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Business impact' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Business impact' }));
    expect(screen.getByText('12 of 12 leads have no source')).toBeInTheDocument();
  });

  it('Danish labels render', () => {
    renderIt('da');
    expect(screen.getByRole('tab', { name: 'AI-anbefalinger' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anmod om forbindelse' })).toBeInTheDocument();
  });
});
