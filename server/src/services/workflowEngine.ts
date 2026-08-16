import { createIntegrationLog } from '../repositories/integrationLogRepository';
import { findLeadById, updateLead } from '../repositories/leadRepository';
import {
  createWorkflowRun,
  listWorkflowSteps,
  listWorkflows,
  updateWorkflowRun,
} from '../repositories/workflowRepository';

type Trigger = 'new_lead_created' | 'integration_connected' | 'manual_trigger';
type StepType = 'condition' | 'action' | 'delay';

function evaluateCondition(lead: Record<string, unknown> | null, config: Record<string, unknown>) {
  if (!lead) return false;
  const type = String(config.type || '');
  const field = String(config.field || '');
  const value = String(config.value || '');
  const leadValue = field ? String((lead as Record<string, unknown>)[field] || '') : '';
  if (type === 'field_equals') return leadValue === value;
  if (type === 'field_contains') return leadValue.toLowerCase().includes(value.toLowerCase());
  if (type === 'country_equals') {
    const meta = (lead as Record<string, unknown>).sourceMeta as Record<string, unknown> | undefined;
    const country = String(meta?.country || meta?.location || '');
    return country.toLowerCase() === value.toLowerCase();
  }
  if (type === 'provider_equals') {
    return String((lead as Record<string, unknown>).source || '') === value;
  }
  if (type === 'has_email') {
    return Boolean((lead as Record<string, unknown>).email);
  }
  return false;
}

async function executeAction(stepConfig: Record<string, unknown>, lead: Record<string, unknown> | null) {
  const action = String(stepConfig.action || '');
  if (action === 'send_webhook') {
    const url = String(stepConfig.url || '');
    if (!url || !lead) return;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead,
        company: lead.company,
        email: lead.email,
        source: lead.source,
        userId: lead.ownerUserId,
      }),
    });
    return;
  }
  if (action === 'update_lead_status' && lead) {
    const status = String(stepConfig.status || '');
    await updateLead(String(lead.id), { status });
    return;
  }
  if (action === 'add_tag' && lead) {
    const tag = String(stepConfig.tag || '').trim();
    if (!tag) return;
    const existing = Array.isArray(lead.tags) ? (lead.tags as string[]) : [];
    const next = Array.from(new Set([...existing, tag]));
    await updateLead(String(lead.id), { tags: next });
    return;
  }
  if (action === 'send_to_integration') {
    // Placeholder: hook into provider connectors later.
    return;
  }
}

export async function triggerWorkflowsForLead(userId: string, leadId: string) {
  const workflows = listWorkflows(userId).filter((workflow) => workflow.status === 'active');
  workflows
    .filter((workflow) => workflow.triggerType === 'new_lead_created')
    .forEach((workflow) => {
      createWorkflowRun({
        workflowId: workflow.id,
        leadId,
        status: 'running',
        currentStep: 0,
      });
    });
}

export function triggerIntegrationConnected(userId: string) {
  const workflows = listWorkflows(userId).filter((workflow) => workflow.status === 'active');
  workflows
    .filter((workflow) => workflow.triggerType === 'integration_connected')
    .forEach((workflow) => {
      createWorkflowRun({
        workflowId: workflow.id,
        status: 'running',
        currentStep: 0,
      });
    });
}

export async function runWorkflowStep(
  runId: string,
  workflowId: string,
  leadId?: string,
  startStep = 0
) {
  const steps = listWorkflowSteps(workflowId);
  const runLead = leadId ? findLeadById(leadId) : null;
  const run = steps.length ? steps : [];
  if (run.length === 0) {
    updateWorkflowRun(runId, { status: 'completed' });
    return;
  }
  let current = run.findIndex((step) => step.stepOrder === startStep);
  if (current < 0) current = 0;

  const runRecord = runLead ? { ...runLead } : null;
  let stepIndex = current;
  for (; stepIndex < run.length; stepIndex += 1) {
    const step = run[stepIndex];
    if (step.type === 'condition') {
      const ok = evaluateCondition(runRecord, step.config);
      if (!ok) {
        updateWorkflowRun(runId, { status: 'completed', currentStep: step.stepOrder });
        return;
      }
      continue;
    }
    if (step.type === 'delay') {
      const minutes = Number(step.config.minutes || 1);
      const nextRunAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      const nextStepOrder = run[stepIndex + 1]?.stepOrder ?? step.stepOrder + 1;
      updateWorkflowRun(runId, { status: 'waiting', currentStep: nextStepOrder, nextRunAt });
      return;
    }
    if (step.type === 'action') {
      try {
        await executeAction(step.config, runRecord);
      } catch (error) {
        createIntegrationLog({
          userId: runRecord?.ownerUserId ? String(runRecord.ownerUserId) : 'unknown',
          provider: String(step.config.provider || 'workflow'),
          status: 'error',
          message: (error as Error).message,
        });
      }
    }
  }
  const lastStepOrder = run[run.length - 1]?.stepOrder ?? 0;
  updateWorkflowRun(runId, { status: 'completed', currentStep: lastStepOrder });
}

