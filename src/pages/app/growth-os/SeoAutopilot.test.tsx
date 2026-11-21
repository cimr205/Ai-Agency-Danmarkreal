import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { I18nProvider, translate } from '@/lib/i18n';
import { inferStage } from './seoStage';

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const state = vi.hoisted(() => ({
  site: null as unknown, runs: [] as unknown[], drafts: [] as unknown[], findings: [] as unknown[], tasks: [] as unknown[], ga4: [] as unknown[],
  roles: [{ role: 'owner', can_grant_permissions: false }], mutate: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { company_id: 'c1' }, roles: state.roles, isSystemAdmin: false }) }));
vi.mock('@/hooks/api/useGrowthAnalytics', () => ({ useGa4Daily: () => ({ data: state.ga4, error: null, isLoading: false }) }));
vi.mock('@/hooks/api/useSeoAutopilot', () => {
  const q = (data: () => unknown) => () => ({ data: data(), error: null, isLoading: false });
  const m = () => ({ mutate: state.mutate, isPending: false, isSuccess: false, error: null });
  return {
    useSeoSite: q(() => state.site), useSeoRuns: q(() => state.runs), useSeoDrafts: q(() => state.drafts), useSeoFindings: q(() => state.findings),
    useSeoChanges: q(() => []), useSeoTasks: q(() => state.tasks), useSeoReports: q(() => []),
    useConfigureSeoSite: m, useDecideSeoDraft: m, useRunSeoAutopilot: m, useSetSeoAutoPublish: m, useUnpublishSeoDraft: m,
  };
});

import { SeoAutopilot } from './SeoAutopilot';

const renderIt = (locale: 'en' | 'da' = 'en') => render(<I18nProvider locale={locale}><SeoAutopilot t={(k) => translate(locale, k)} /></I18nProvider>);
const SITE = {
  company_id: 'c1', site_url: 'https://www.x.dk', enabled: true, crawl_every_hours: 6, max_pages: 60, max_pending_drafts: 8, llm_calls_per_day: 12, product_facts: '',
  last_run_at: '2026-11-18T10:00:00Z', updated_at: 'u', auto_publish: false, auto_publish_since: null, publish_min_score: 8, max_publish_per_day: 1, last_deploy_requested_at: null,
};
const run = (over: object) => ({ id: 'r1', kind: 'loop', trigger: 'schedule', status: 'ok', score: 64, pages: 12, findings: 3, changes: 0, llm_calls: 2, models: ['m:free'], cost_usd: 0, summary: 's', error: null, log: [], started_at: '2026-11-18T10:00:00Z', finished_at: null, ...over });
const draft = { id: 'd1', kind: 'page', slug: '/crm/gratis-crm', title: 'Gratis CRM', meta_description: null, h1: null, summary: null, body: 'tekst', worker_model: 'm:free', review_model: 'm:free', review_score: 8, review_notes: 'god', review_status: 'passed', decision: 'pending', decided_at: null, created_at: '2026-11-18T10:00:00Z', published_at: null, published_by: null, unpublished_at: null, publish_block_reason: null };

beforeEach(() => {
  state.site = null; state.runs = []; state.drafts = []; state.findings = []; state.tasks = []; state.ga4 = []; state.mutate.mockReset();
  state.roles = [{ role: 'owner', can_grant_permissions: false }];
});

describe('Growth OS SEO autopilot (mission control)', () => {
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

  it('shows status, the latest score with its change, findings, tasks and usage', () => {
    state.site = SITE;
    state.runs = [run({ id: 'r2', score: 70 }), run({ id: 'r1', score: 64, started_at: '2026-11-18T04:00:00Z' })];
    state.findings = [{ id: 1, url: 'https://www.x.dk/da', severity: 'high', issue: 'Ingen <h1>', fix: 'Tilføj H1' }];
    state.tasks = [{ id: 't1', type: 'page_draft', title: 'Skriv CRM-side', target: null, rationale: null, priority: 1, status: 'open', attempts: 0, error: null, created_at: '2026-11-18T10:00:00Z' }];
    renderIt();
    expect(screen.getByText('Resting')).toBeInTheDocument();
    expect(screen.getByText('watching https://www.x.dk')).toBeInTheDocument();
    expect(screen.getByText('+6 since the previous crawl')).toBeInTheDocument();
    expect(screen.getByText('Ingen <h1>')).toBeInTheDocument();
    expect(screen.getAllByText('Skriv CRM-side').length).toBeGreaterThan(0);
    expect(screen.getByText('m:free')).toBeInTheDocument();
  });

  it('a running round lights up the step it is on', () => {
    state.site = SITE;
    state.runs = [run({ id: 'r3', status: 'running', score: null, log: ['[t] Crawler https://www.x.dk ...', '[t] Udfører opgave "X" (page_draft).'] })];
    renderIt();
    expect(screen.getByText('Working now: Writer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'A round is running' })).toBeDisabled();
  });

  it('a reviewed draft waits for the owner, who can approve it', () => {
    state.site = SITE; state.drafts = [draft];
    renderIt();
    expect(screen.getByText('score 8/10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
    expect(state.mutate).toHaveBeenCalledWith({ id: 'd1', approve: true });
  });

  it('the owner switches automatic publishing on, and can take a live article offline', () => {
    state.site = SITE; state.drafts = [{ ...draft, decision: 'approved', published_at: '2026-11-19T10:00:00Z', published_by: 'autopilot' }];
    renderIt();
    fireEvent.click(screen.getByLabelText('Publish automatically'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]);
    expect(state.mutate).toHaveBeenCalledWith({ enabled: true, minScore: 8, maxPerDay: 1 });
    fireEvent.change(screen.getByRole('combobox', { name: 'Draft queue' }), { target: { value: 'live' } });
    expect(screen.getByText('Live (published automatically)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take offline' }));
    expect(state.mutate).toHaveBeenCalledWith('d1');
  });

  it('employees can read drafts but not decide, run or change settings', () => {
    state.site = SITE; state.drafts = [draft];
    state.roles = [{ role: 'employee', can_grant_permissions: false }];
    renderIt();
    expect(screen.queryByRole('button', { name: 'Run a round now' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
    expect(screen.getByText('Only an owner or company admin can change the setup.')).toBeInTheDocument();
  });

  it('organic traffic comes from the synced GA4 rows', () => {
    state.site = SITE;
    state.ga4 = [
      { day: '2026-11-17', channel_group: 'Organic Search', sessions: 5, active_users: 0, engaged_sessions: 0, key_events: 0 },
      { day: '2026-11-17', channel_group: 'Direct', sessions: 7, active_users: 0, engaged_sessions: 0, key_events: 0 },
      { day: '2026-11-18', channel_group: 'Organic Search', sessions: 3, active_users: 0, engaged_sessions: 0, key_events: 0 },
    ];
    renderIt();
    expect(screen.getByText(/Organic search \(8 sessions over 2 days\)/)).toBeInTheDocument();
  });

  it('Danish labels render', () => {
    state.site = SITE;
    renderIt('da');
    expect(screen.getByRole('button', { name: 'Kør en runde nu' })).toBeInTheDocument();
    const pipeline = screen.getByText('Agent-pipeline').closest('section')!;
    expect(within(pipeline).getByText('Skribent')).toBeInTheDocument();
  });
});

describe('inferStage', () => {
  it('reads the latest step from the service log', () => {
    expect(inferStage([])).toBe(-1);
    expect(inferStage(['Crawler https://x ...'])).toBe(0);
    expect(inferStage(['Crawl færdig: 3 sider', 'Planlagde 2 opgave(r).'])).toBe(1);
    expect(inferStage(['Udfører opgave "A" (page_draft).', 'Udkast "A" gemt; sendes til review.'])).toBe(3);
    expect(inferStage(['Review af "A": score 9 → venter på menneskelig godkendelse.'])).toBe(4);
  });
});
