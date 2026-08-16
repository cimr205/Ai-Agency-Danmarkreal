import { listCompanies } from '../../repositories/companyRepository';
import { runCompanyAnalysis } from './aiAgent';

const DEFAULT_INTERVAL_MS = 1000 * 60 * 60 * 24;

export function startAiAnalysisCron() {
  const tick = async () => {
    const companies = listCompanies();
    for (const company of companies) {
      await runCompanyAnalysis(company.id);
    }
  };

  tick().catch(() => undefined);
  const handle = setInterval(() => {
    tick().catch(() => undefined);
  }, DEFAULT_INTERVAL_MS);

  return () => clearInterval(handle);
}

