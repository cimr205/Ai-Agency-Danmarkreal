import { listLeadsByCompany } from '../../repositories/leadRepository';
import { listWorkflows } from '../../repositories/workflowRepository';
import { listCompanies } from '../../repositories/companyRepository';

export function getCompanyContext(companyId: string) {
  const leads = listLeadsByCompany(companyId).slice(0, 50);
  const workflows = listWorkflows(companyId);
  const company = listCompanies().find((item) => item.id === companyId);
  const stats = {
    leads: leads.length,
    workflows: workflows.length,
  };
  return {
    company: {
      id: companyId,
      name: company?.name || 'Unknown',
    },
    leads,
    workflows,
    employees: [],
    stats,
  };
}

