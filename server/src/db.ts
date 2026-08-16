import fs from 'fs';
import path from 'path';

const dbPath = process.env.DB_PATH || './data.json';
const resolvedPath = path.resolve(dbPath);

export interface StoreUser {
  id: string;
  name?: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt?: string;
  role: 'admin' | 'user';
  companyId?: string;
  createdAt: string;
}

export interface StoreCompany {
  id: string;
  name: string;
  ownerUserId?: string;
  userLimit?: number;
  joinCode: string;
  defaultLanguage: string;
  defaultTheme: 'light' | 'dark';
  createdAt: string;
  status?: 'pending' | 'active';
  mode?: 'setup' | 'live' | 'locked';
  complianceChecklist?: Array<{
    id: string;
    label: string;
    completed: boolean;
    updatedAt?: string;
  }>;
}

export interface StoreOAuthState {
  id: string;
  state: string;
  inviteToken?: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoreEmailOAuthState {
  id: string;
  state: string;
  ownerUserId: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoreMetaOAuthState {
  id: string;
  state: string;
  companyId: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoreIntegrationOAuthState {
  id: string;
  state: string;
  userId: string;
  provider: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoreInvitation {
  id: string;
  companyId: string;
  email: string;
  role: 'admin' | 'user';
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface StoreMessage {
  id: string;
  companyId: string;
  senderUserId: string;
  recipientUserId: string;
  subject: string;
  body: string;
  createdAt: string;
  readAt?: string;
}

export interface StoreNotification {
  id: string;
  companyId: string;
  userId: string;
  title: string;
  body: string;
  createdAt: string;
  readAt?: string;
}

export interface StoreCalendarEvent {
  id: string;
  companyId: string;
  ownerUserId: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  participantUserIds: string[];
  createdAt: string;
}

export interface StoreSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoreEmailVerification {
  id: string;
  userId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface StoreLead {
  id: string;
  ownerUserId: string;
  companyId?: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  status: string;
  leadScore: number;
  source?: string;
  sourceRef?: string;
  sourceMeta?: Record<string, unknown>;
  notes?: string;
  lastContactedAt?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StoreTask {
  id: string;
  ownerUserId: string;
  type: string;
  title: string;
  status: string;
  dueAt: string;
  completedAt?: string;
  leadId?: string;
  customerId?: string;
  dealId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreDeal {
  id: string;
  ownerUserId: string;
  title: string;
  value: number;
  stageId: string;
  stageEnteredAt: string;
  employeeId?: string;
  leadId?: string;
  customerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreActivity {
  id: string;
  ownerUserId: string;
  leadId?: string;
  customerId?: string;
  dealId?: string;
  type: string;
  direction?: string;
  summary: string;
  subject?: string;
  messageId?: string;
  createdAt: string;
}

export interface StoreEmailAccount {
  id: string;
  ownerUserId: string;
  companyId?: string;
  provider: 'gmail' | 'smtp';
  email: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreEmailMessage {
  id: string;
  ownerUserId: string;
  accountId: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string[];
  subject: string;
  body: string;
  threadId?: string;
  messageId?: string;
  receivedAt?: string;
  sentAt?: string;
  handledAt?: string;
  handledStatus?: string;
  handledReason?: string;
  handledBy?: string;
  isRead?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoreTodo {
  id: string;
  ownerUserId: string;
  companyId?: string;
  title: string;
  description?: string;
  status: 'open' | 'done' | 'overdue';
  priorityBucket?: 'now' | 'next' | 'later';
  assignedUserId?: string;
  department?: string;
  source?: string;
  visibilityScope?: 'personal' | 'company';
  actionType?: string;
  recommendedAction?: string;
  actionAlternatives?: string[];
  actionState?: string;
  actionMeta?: Record<string, unknown>;
  dueAt?: string;
  rationale?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreCampaign {
  id: string;
  ownerUserId: string;
  companyId?: string;
  name: string;
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'failed';
  templateId?: string;
  scheduledAt?: string;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreCampaignRecipient {
  id: string;
  campaignId: string;
  name: string;
  email: string;
  status: 'pending' | 'sent' | 'failed';
  sentAt?: string;
  error?: string;
}

export interface StoreCampaignJob {
  id: string;
  campaignId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  createdAt: string;
}

export interface StoreEmailTemplate {
  id: string;
  companyId: string;
  name: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreInviteCode {
  id: string;
  code: string;
  companyId: string;
  role: 'admin' | 'user';
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedByUserId?: string;
}

export interface StoreEmailAnalysisJob {
  id: string;
  emailId: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreMetaConnection {
  companyId: string;
  metaAccessToken: string;
  metaAdAccountId: string;
  metaBusinessId: string;
  tokenExpiresAt: string;
  connectedAt: string;
}

export interface StoreIntegrationConnection {
  id: string;
  userId: string;
  provider: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSearchJob {
  id: string;
  userId: string;
  provider: string;
  query: string;
  status: 'active' | 'paused';
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreIntegrationLog {
  id: string;
  userId: string;
  provider: string;
  status: 'ok' | 'error' | 'rate_limited';
  message: string;
  createdAt: string;
}

export interface StoreWorkflow {
  id: string;
  userId: string;
  name: string;
  nodeRedFlowId?: string;
  status: 'active' | 'paused';
  triggerType: 'new_lead_created' | 'integration_connected' | 'manual_trigger';
  createdAt: string;
  updatedAt: string;
}

export interface StoreWorkflowStep {
  id: string;
  workflowId: string;
  type: 'condition' | 'action' | 'delay';
  config: Record<string, unknown>;
  stepOrder: number;
}

export interface StoreWorkflowRun {
  id: string;
  workflowId: string;
  leadId?: string;
  status: 'running' | 'waiting' | 'completed' | 'failed';
  currentStep: number;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreAiSuggestion {
  id: string;
  companyId: string;
  type: 'workflow' | 'crm' | 'hr' | 'insight';
  title: string;
  description: string;
  json: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface StoreAiActivity {
  id: string;
  companyId: string;
  message: string;
  type: string;
  createdAt: string;
}

export interface StoreAiMemory {
  companyId: string;
  summary: string;
  updatedAt: string;
}

export interface StoreAiDailyFocus {
  id: string;
  companyId: string;
  date: string;
  json: Array<Record<string, unknown>>;
  createdAt: string;
}

export interface StoreMetaEntityChange {
  id: string;
  companyId: string;
  entityType: 'campaign' | 'adset' | 'ad';
  entityId: string;
  action: string;
  createdAt: string;
}

export interface StoreMetaAutomationLog {
  id: string;
  companyId: string;
  action: string;
  status: 'ok' | 'error';
  message: string;
  createdAt: string;
}

export interface StoreTenantIntegration {
  companyId: string;
  websiteTrackingKey: string;
  websiteDomains: string[];
  metaPixelId?: string;
  metaCapiToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreWebsiteEvent {
  id: string;
  companyId: string;
  eventName: string;
  url?: string;
  referrer?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface StoreAiActionConfig {
  companyId: string;
  enabledActions: string[];
  toneOfVoice: string;
  autoSendMode: 'draft' | 'auto';
  bookingWindowStart: string;
  bookingWindowEnd: string;
  bookingTimezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreClowdBotIntegration {
  id: string;
  companyId: string;
  provider: 'apollo' | 'google_places' | 'hubspot' | 'salesforce' | 'hunter' | 'clearbit';
  authType: 'api_key' | 'oauth' | 'token';
  encryptedConfig: string;
  status: 'connected' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface StoreClowdBotSearchJob {
  id: string;
  companyId: string;
  createdByUserId: string;
  name: string;
  status: 'active' | 'paused';
  criteria: {
    keywords?: string[];
    industries?: string[];
    countries?: string[];
    locations?: string[];
    companySize?: string;
    roles?: string[];
  };
  sources: Array<'apollo' | 'google_places' | 'hubspot' | 'salesforce' | 'hunter' | 'clearbit'>;
  schedule: {
    intervalMinutes: number;
    deliverHour: number;
    deliverTimezone: string;
  };
  lastRunAt?: string;
  lastDeliveryDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreClowdBotSearchRun {
  id: string;
  jobId: string;
  companyId: string;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt?: string;
  leadCount?: number;
  error?: string;
}

export interface StoreClowdBotDelivery {
  id: string;
  jobId: string;
  companyId: string;
  dateKey: string;
  leadCount: number;
  createdAt: string;
}

export interface StoreMetaLeadSyncState {
  id: string;
  companyId: string;
  formId: string;
  lastLeadgenId?: string;
  lastSyncAt?: string;
}

export interface StoreData {
  users: StoreUser[];
  companies: StoreCompany[];
  oauthStates: StoreOAuthState[];
  emailOauthStates: StoreEmailOAuthState[];
  metaOauthStates: StoreMetaOAuthState[];
  integrationOauthStates: StoreIntegrationOAuthState[];
  invitations: StoreInvitation[];
  messages: StoreMessage[];
  notifications: StoreNotification[];
  calendarEvents: StoreCalendarEvent[];
  sessions: StoreSession[];
  emailVerifications: StoreEmailVerification[];
  leads: StoreLead[];
  tasks: StoreTask[];
  deals: StoreDeal[];
  activities: StoreActivity[];
  emailAccounts: StoreEmailAccount[];
  emails: StoreEmailMessage[];
  todos: StoreTodo[];
  campaigns: StoreCampaign[];
  campaignRecipients: StoreCampaignRecipient[];
  campaignJobs: StoreCampaignJob[];
  emailTemplates: StoreEmailTemplate[];
  inviteCodes: StoreInviteCode[];
  emailAnalysisJobs: StoreEmailAnalysisJob[];
  metaConnections: StoreMetaConnection[];
  integrationConnections: StoreIntegrationConnection[];
  searchJobs: StoreSearchJob[];
  integrationLogs: StoreIntegrationLog[];
  workflows: StoreWorkflow[];
  workflowSteps: StoreWorkflowStep[];
  workflowRuns: StoreWorkflowRun[];
  aiSuggestions: StoreAiSuggestion[];
  aiActivity: StoreAiActivity[];
  aiMemory: StoreAiMemory[];
  aiDailyFocus: StoreAiDailyFocus[];
  metaEntityChanges: StoreMetaEntityChange[];
  metaAutomationLogs: StoreMetaAutomationLog[];
  tenantIntegrations: StoreTenantIntegration[];
  websiteEvents: StoreWebsiteEvent[];
  aiActionConfigs: StoreAiActionConfig[];
  clowdBotIntegrations: StoreClowdBotIntegration[];
  clowdBotSearchJobs: StoreClowdBotSearchJob[];
  clowdBotSearchRuns: StoreClowdBotSearchRun[];
  clowdBotDeliveries: StoreClowdBotDelivery[];
  metaLeadSyncStates: StoreMetaLeadSyncState[];
}

const emptyStore: StoreData = {
  users: [],
  companies: [],
  oauthStates: [],
  emailOauthStates: [],
  metaOauthStates: [],
  integrationOauthStates: [],
  invitations: [],
  messages: [],
  notifications: [],
  calendarEvents: [],
  sessions: [],
  emailVerifications: [],
  leads: [],
  tasks: [],
  deals: [],
  activities: [],
  emailAccounts: [],
  emails: [],
  todos: [],
  campaigns: [],
  campaignRecipients: [],
  campaignJobs: [],
  emailTemplates: [],
  inviteCodes: [],
  emailAnalysisJobs: [],
  metaConnections: [],
  integrationConnections: [],
  searchJobs: [],
  integrationLogs: [],
  workflows: [],
  workflowSteps: [],
  workflowRuns: [],
  aiSuggestions: [],
  aiActivity: [],
  aiMemory: [],
  aiDailyFocus: [],
  metaEntityChanges: [],
  metaAutomationLogs: [],
  tenantIntegrations: [],
  websiteEvents: [],
  aiActionConfigs: [],
  clowdBotIntegrations: [],
  clowdBotSearchJobs: [],
  clowdBotSearchRuns: [],
  clowdBotDeliveries: [],
  metaLeadSyncStates: [],
};

function defaultComplianceChecklist() {
  return [
    { id: 'company_profile', label: 'Complete company profile', completed: false },
    { id: 'connect_email', label: 'Connect email account', completed: false },
    { id: 'connect_meta', label: 'Connect Meta Ads', completed: false },
    { id: 'import_leads', label: 'Import or create first lead', completed: false },
    { id: 'create_workflow', label: 'Create first workflow', completed: false },
  ];
}

function loadStore(): StoreData {
  if (!fs.existsSync(resolvedPath)) {
    return { ...emptyStore };
  }
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  if (!raw.trim()) return { ...emptyStore };
  const parsed = JSON.parse(raw) as Partial<StoreData>;
  const users = (parsed.users || []).map((user) => ({
    ...user,
    role: user.role || 'user',
  }));
  const companies: StoreCompany[] = (parsed.companies || []).map((company) => ({
    ...company,
    joinCode: company.joinCode || company.id.slice(0, 8).toUpperCase(),
    defaultLanguage: company.defaultLanguage || 'en',
    defaultTheme: (company.defaultTheme === 'dark' ? 'dark' : 'light') as 'dark' | 'light',
    status: company.status || 'pending',
    mode: company.mode || 'setup',
    complianceChecklist: company.complianceChecklist || defaultComplianceChecklist(),
  }));
  return {
    users,
    companies,
    oauthStates: parsed.oauthStates || [],
    emailOauthStates: parsed.emailOauthStates || [],
    metaOauthStates: parsed.metaOauthStates || [],
    integrationOauthStates: parsed.integrationOauthStates || [],
    invitations: parsed.invitations || [],
    messages: parsed.messages || [],
    notifications: parsed.notifications || [],
    calendarEvents: parsed.calendarEvents || [],
    sessions: parsed.sessions || [],
    emailVerifications: parsed.emailVerifications || [],
    leads: parsed.leads || [],
    tasks: parsed.tasks || [],
    deals: parsed.deals || [],
    activities: parsed.activities || [],
    emailAccounts: parsed.emailAccounts || [],
    emails: parsed.emails || [],
    todos: parsed.todos || [],
    campaigns: parsed.campaigns || [],
    campaignRecipients: parsed.campaignRecipients || [],
    campaignJobs: parsed.campaignJobs || [],
    emailTemplates: parsed.emailTemplates || [],
    inviteCodes: parsed.inviteCodes || [],
    emailAnalysisJobs: parsed.emailAnalysisJobs || [],
    metaConnections: parsed.metaConnections || [],
    integrationConnections: parsed.integrationConnections || [],
    searchJobs: parsed.searchJobs || [],
    integrationLogs: parsed.integrationLogs || [],
    workflows: parsed.workflows || [],
    workflowSteps: parsed.workflowSteps || [],
    workflowRuns: parsed.workflowRuns || [],
    aiSuggestions: parsed.aiSuggestions || [],
    aiActivity: parsed.aiActivity || [],
    aiMemory: parsed.aiMemory || [],
    aiDailyFocus: parsed.aiDailyFocus || [],
    metaEntityChanges: parsed.metaEntityChanges || [],
    metaAutomationLogs: parsed.metaAutomationLogs || [],
    tenantIntegrations: parsed.tenantIntegrations || [],
    websiteEvents: parsed.websiteEvents || [],
    aiActionConfigs: parsed.aiActionConfigs || [],
    clowdBotIntegrations: parsed.clowdBotIntegrations || [],
    clowdBotSearchJobs: parsed.clowdBotSearchJobs || [],
    clowdBotSearchRuns: parsed.clowdBotSearchRuns || [],
    clowdBotDeliveries: parsed.clowdBotDeliveries || [],
    metaLeadSyncStates: parsed.metaLeadSyncStates || [],
  };
}

function saveStore(store: StoreData) {
  fs.writeFileSync(resolvedPath, JSON.stringify(store, null, 2));
}

export function initStore() {
  if (!fs.existsSync(resolvedPath)) {
    saveStore(emptyStore);
  }
}

export function readStore(): StoreData {
  return loadStore();
}

export function updateStore<T>(mutator: (store: StoreData) => T): T {
  const store = loadStore();
  const result = mutator(store);
  saveStore(store);
  return result;
}

