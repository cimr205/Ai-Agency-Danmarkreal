import { askAI } from './openaiClient';
import { listLeadsByCompany } from '../../repositories/leadRepository';
import { listWorkflows } from '../../repositories/workflowRepository';
import { getAiMemory } from '../../repositories/aiMemoryRepository';
import { createAiActivity } from '../../repositories/aiActivityRepository';
import { createDailyFocus, getLatestDailyFocus } from '../../repositories/aiDailyFocusRepository';
import { listCompanies } from '../../repositories/companyRepository';

type DailyFocusItem = {
  title: string;
  description: string;
  type: 'lead' | 'workflow' | 'hr' | 'system';
  priority: 'high' | 'medium' | 'low';
  action?: string;
};

const MAX_ITEMS = 5;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function generateDailyFocus(companyId: string, force = false) {
  if (!force) {
    const existing = getLatestDailyFocus(companyId, todayKey());
    if (existing) return existing;
  }

  const leads = listLeadsByCompany(companyId).slice(0, 50);
  const workflows = listWorkflows(companyId);
  const memory = getAiMemory(companyId);
  const prompt = JSON.stringify({
    leads,
    workflows,
    memory: memory?.summary || '',
  });
  const system = `Generate top ${MAX_ITEMS} priorities for today for this company.
Return JSON array only. Each item: { title, description, type (lead|workflow|hr|system), priority (high|medium|low), action }.
Keep it concise.`;

  const content = await askAI(prompt, system);
  const parsed = JSON.parse(content) as DailyFocusItem[];
  const focus = createDailyFocus({
    companyId,
    date: todayKey(),
    json: parsed.slice(0, MAX_ITEMS),
  });
  createAiActivity({
    companyId,
    message: 'AI prepared your focus for today',
    type: 'daily_focus',
  });
  return focus;
}

const DAILY_INTERVAL_MS = 1000 * 60 * 60 * 24;

export function startAiDailyFocusCron() {
  const tick = async () => {
    const companies = listCompanies();
    for (const company of companies) {
      await generateDailyFocus(company.id);
    }
  };

  tick().catch(() => undefined);
  const handle = setInterval(() => {
    tick().catch(() => undefined);
  }, DAILY_INTERVAL_MS);

  return () => clearInterval(handle);
}
