import { updateStore, readStore, type StoreAiActionConfig } from '../db';

type AiActionDefinition = {
  id: string;
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  defaultMode: 'draft' | 'auto';
};

const AI_ACTIONS: AiActionDefinition[] = [
  {
    id: 'ai_write_email',
    name: 'AI Write Email',
    description: 'Instant human follow-up for new leads.',
    inputs: ['lead', 'source', 'visited pages', 'tone', 'booking link'],
    outputs: ['subject', 'body'],
    defaultMode: 'draft',
  },
  {
    id: 'ai_summarize_thread',
    name: 'AI Summarize Thread',
    description: 'Summarize long threads in 2-4 lines.',
    inputs: ['email thread'],
    outputs: ['summary', 'intent', 'next step'],
    defaultMode: 'draft',
  },
  {
    id: 'ai_create_tasks',
    name: 'AI Create Tasks',
    description: 'Create next tasks after pipeline changes.',
    inputs: ['deal stage', 'lead context'],
    outputs: ['task list', 'assignees', 'deadlines'],
    defaultMode: 'auto',
  },
  {
    id: 'ai_suggest_meeting',
    name: 'AI Suggest Meeting Times',
    description: 'Suggest meeting times from calendar availability.',
    inputs: ['availability', 'timezone'],
    outputs: ['time suggestions', 'booking link'],
    defaultMode: 'draft',
  },
  {
    id: 'ai_lead_qualification',
    name: 'AI Lead Qualification',
    description: 'Score leads using behavior + intent.',
    inputs: ['form submit', 'visitor history'],
    outputs: ['score', 'label', 'next action'],
    defaultMode: 'auto',
  },
  {
    id: 'ai_workflow_suggestion',
    name: 'AI Workflow Suggestion',
    description: 'Suggest automations during onboarding.',
    inputs: ['company profile'],
    outputs: ['suggested workflows'],
    defaultMode: 'draft',
  },
  {
    id: 'ai_ceo_daily_summary',
    name: 'AI Daily CEO Summary',
    description: 'Daily leadership summary with actions.',
    inputs: ['leads', 'pipeline', 'tasks'],
    outputs: ['summary', 'attention items'],
    defaultMode: 'draft',
  },
];

export function listAiActions() {
  return AI_ACTIONS;
}

function defaultConfig(companyId: string): StoreAiActionConfig {
  const now = new Date().toISOString();
  return {
    companyId,
    enabledActions: [],
    toneOfVoice: 'Professional, friendly, concise',
    autoSendMode: 'draft',
    bookingWindowStart: '09:00',
    bookingWindowEnd: '16:00',
    bookingTimezone: 'Europe/Copenhagen',
    createdAt: now,
    updatedAt: now,
  };
}

export function getAiActionConfig(companyId: string) {
  const store = readStore();
  return store.aiActionConfigs.find((row) => row.companyId === companyId) || null;
}

export function upsertAiActionConfig(
  companyId: string,
  input: Partial<Omit<StoreAiActionConfig, 'companyId' | 'createdAt' | 'updatedAt'>>
) {
  const now = new Date().toISOString();
  return updateStore((store) => {
    let config = store.aiActionConfigs.find((row) => row.companyId === companyId);
    if (!config) {
      config = defaultConfig(companyId);
      store.aiActionConfigs.push(config);
    }

    if (input.enabledActions) config.enabledActions = input.enabledActions;
    if (input.toneOfVoice) config.toneOfVoice = input.toneOfVoice;
    if (input.autoSendMode) config.autoSendMode = input.autoSendMode;
    if (input.bookingWindowStart) config.bookingWindowStart = input.bookingWindowStart;
    if (input.bookingWindowEnd) config.bookingWindowEnd = input.bookingWindowEnd;
    if (input.bookingTimezone) config.bookingTimezone = input.bookingTimezone;
    config.updatedAt = now;
    return config;
  });
}

export function ensureAiActionConfig(companyId: string) {
  const existing = getAiActionConfig(companyId);
  if (existing) return existing;
  return upsertAiActionConfig(companyId, {});
}



