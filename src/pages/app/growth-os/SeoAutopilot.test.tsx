import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { I18nProvider, translate } from '@/lib/i18n';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const state = vi.hoisted(() => ({
  site: null as unknown, runs: [] as unknown[], drafts: [] as unknown[], findings: [] as unknown[],
  roles: [{ role: 'owner', can_grant_permissions: false }], mutate: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { company_id: 'c1' }, roles: state.roles, isSystemAdmin: false }) }));
vi.mock('@/hooks/api/useSeoAutopilot', () => {
  const q = (data: () => unknown) => () => ({ data: data(), error: null, isLoading: false });
  const m = () => ({ mutate: state.mutate, isPending: false, isSuccess: false, error: null });
  return {
    useSeoSite: q(() => state.site), useSeoRuns: q(() => state.runs), useSeoDrafts: q(() => state.drafts), useSeoFindings: q(() => state.findings),
    useSeoChanges: q(() => []), useSeoTasks: q(() => []), useSeoReports: q(() => []),
    useConfigureSeoSite: m, useDecideSeoDraft: m, useRunSeoAutopilot: m, useSetSeoAutoPublish: m, useUnpublishSeoDraft: m,
  };
});

import { SeoAutopilot } from './SeoAutopilot';

const renderIt = (locale: 'en' | 'da' = 'en') => render(<I18nProvider locale={locale}><SeoAutopilot t={(k) => translate(locale, k)} /></I18nProvider>);
const SITE = { company_id: 'c1', site_url: 'https://www.x.dk', enabled: true, crawl_every_hours: 6, max_pages: 60, max_pending_drafts: 8, llm_calls_per_day: 12, product_facts: '', last_run_at: null, updated_at: 'u' };
const run = (over: object) => ({ id: 'r1', kind: 'loop', trigger: 'schedule', status: 'ok', score: 64, pages: 12, findings: 3, changes: 0, llm_calls: 0, models: [], cost_usd: 0, summary: 's', error: null, log: [], started_at: '2026-11-18T10:00:00Z', finished_at: null, ...over });
const draft = { id: 'd1', kind: 'page', slug: '/crm/gratis-crm', title: 'Gratis CRM', meta_description: null, h1: null, summary: null, body: 'tekst', worker_model: 'm:free', review_model: 'm:free', review_score: 8, review_notes: 'god', review_status: 'passed', decision: 'pending', decided_at: null, created_at: '2026-11-18T10:00:00Z' };

beforeEach(() => {
  state.site = null; state.runs = []; state.drafts = []; state.findings = []; state.mutate.mockReset();
  state.roles = [{ role: 'owner', can_grant_permissions: false }];
});

describe('Growth OS SEO autopilot', () => {
  it('not set up: shows only the setup form, no run button', () => {
    renderIt();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run a round now' })).toBeNull();
  });

  it('owner saves the site setup', () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('Site (https://host)'), { target: { value: 'https://www.x.dk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.mutate).toHaveBeenCalledWith({ siteUrl: 'https://www.x.dk', enabled: true, crawlEveryHours: 6, llmCallsPerDay: 12, productFacts: '' });
  });

  it('shows the latest score with its change and the findings', () => {
    state.site = SITE;
    state.runs = [run({ id: 'r2', score: 70 }), run({ id: 'r1', score: 64, started_at: '2026-11-18T04:00:00Z' })];
    state.findings = [{ id: 1, url: 'https://www.x.dk/da', severity: 'high', issue: 'Ingen <h1>', fix: 'Tilføj H1' }];
    renderIt();
    expect(screen.getByText('70/100')).toBeInTheDocument();
    expect(screen.getByText('+6 since the previous crawl')).toBeInTheDocument();
    expect(screen.getByText('Ingen <h1>')).toBeInTheDocument();
  });

  it('a reviewed draft waits for the owner, who can approve it', () => {
    state.site = SITE; state.drafts = [draft];
    renderIt();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Approval queue' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Approval queue' }));
    expect(screen.getByText('Reviewer: passed · 8/10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    expect(state.mutate).toHaveBeenCalledWith({ id: 'd1', approve: true });
  });

  it('the owner switches automatic publishing on, and can take a live article offline', () => {
    state.site = SITE; state.drafts = [{ ...draft, decision: 'approved', published_at: '2026-11-19T10:00:00Z', published_by: 'autopilot', unpublished_at: null }];
    renderIt();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Approval queue' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Approval queue' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Publish automatically' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]);
    expect(state.mutate).toHaveBeenCalledWith({ enabled: true, minScore: 8, maxPerDay: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(screen.getByText('Live (published automatically)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take offline' }));
    expect(state.mutate).toHaveBeenCalledWith('d1');
  });

  it('employees can read drafts but not decide or run', () => {
    state.site = SITE; state.drafts = [draft];
    state.roles = [{ role: 'employee', can_grant_permissions: false }];
    renderIt();
    expect(screen.queryByRole('button', { name: 'Run a round now' })).toBeNull();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Approval queue' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Approval queue' }));
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('Danish labels render', () => {
    state.site = SITE;
    renderIt('da');
    expect(screen.getByRole('button', { name: 'Kør en runde nu' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Godkendelseskø' })).toBeInTheDocument();
  });
});
