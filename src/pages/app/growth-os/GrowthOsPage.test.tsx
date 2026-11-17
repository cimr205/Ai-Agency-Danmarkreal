import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import da from '@/messages/da.json';
import de from '@/messages/de.json';
import en from '@/messages/en.json';

// Every data hook reports "migration not applied": the page must say so, not show zeros as if nothing happened.
vi.mock('@/hooks/api/useGrowthOs', async () => {
  class GrowthNotInstalledError extends Error {}
  const missing = () => ({ isLoading: false, error: new GrowthNotInstalledError('relation does not exist'), data: undefined });
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null, data: undefined, isSuccess: false });
  return {
    GrowthNotInstalledError,
    useGrowthTasks: missing, useGrowthActivity: missing, useGrowthUsage: missing, useGrowthReports: missing,
    useGrowthLearning: missing, useGrowthApprovals: missing, useGrowthAudit: missing, useGrowthBudget: missing,
    useRunSeoAudit: mutation, useDecideApproval: mutation, useSetGrowthBudget: mutation,
  };
});

import GrowthOsPage from './GrowthOsPage';

function renderAt(path: string, locale: 'en' | 'da' = 'en') {
  return render(
    <I18nProvider locale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/growth-os/*" element={<GrowthOsPage />} /></Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function keys(o: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe('Growth OS page', () => {
  it('shows the missing migration honestly on the Command Center', () => {
    renderAt('/growth-os');
    expect(screen.getAllByText(/not installed in this environment/i).length).toBeGreaterThan(0);
    expect(screen.getByText('1 / 35')).toBeInTheDocument(); // operational specialists come from the registry
    expect(screen.getByText(/Not connected \(no analytics source\)/)).toBeInTheDocument();
  });

  it('lists all 35 specialists with only SEO operational', () => {
    renderAt('/growth-os/agents');
    expect(screen.getAllByRole('row')).toHaveLength(36); // header + 35
    expect(screen.getAllByText('Operational').length).toBeGreaterThanOrEqual(2); // filter tab + SEO pill
    expect(screen.getAllByText('Registered only').length).toBeGreaterThanOrEqual(34);
  });

  it('agent detail renders the eleven tabs in Danish', () => {
    renderAt('/growth-os/agents/seo-agent', 'da');
    for (const tab of ['Overblik', 'Opgaver', 'Subagent', 'Skills', 'Hukommelse', 'Læring', 'Evalueringer', 'Performance', 'Aktivitetslog', 'Godkendelser', 'Indstillinger']) {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument();
    }
  });

  it('unbuilt areas say so instead of simulating data', () => {
    renderAt('/growth-os/experiments');
    expect(screen.getByText('Not implemented yet')).toBeInTheDocument();
  });

  it('en, da and de have the same growthOs keys', () => {
    const k = (m: Record<string, unknown>) => keys(m.growthOs as Record<string, unknown>).sort();
    expect(k(da)).toEqual(k(en));
    expect(k(de)).toEqual(k(en));
  });
});
