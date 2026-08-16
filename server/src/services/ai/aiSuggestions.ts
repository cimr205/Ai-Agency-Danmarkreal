import { createWorkflow, replaceWorkflowSteps } from '../../repositories/workflowRepository';
import { updateAiSuggestionStatus } from '../../repositories/aiSuggestionRepository';
import { createAiActivity } from '../../repositories/aiActivityRepository';
import { randomUUID } from 'crypto';

function createNodeRedFlowId() {
  return `nr_${randomUUID()}`;
}

export function approveWorkflowSuggestion(input: {
  suggestionId: string;
  companyId: string;
  workflowJson: { name: string; trigger: string; steps: Array<Record<string, unknown>> };
  nodeRedFlowId?: string;
}) {
  const workflow = createWorkflow({
    userId: input.companyId,
    name: input.workflowJson.name,
    status: 'active',
    triggerType: input.workflowJson.trigger as 'new_lead_created' | 'integration_connected' | 'manual_trigger',
    nodeRedFlowId: input.nodeRedFlowId || createNodeRedFlowId(),
  });
  const steps = input.workflowJson.steps.map((step, index) => ({
    id: randomUUID(),
    workflowId: workflow.id,
    type: String(step.type || 'action') as 'condition' | 'action' | 'delay',
    config: (step.config as Record<string, unknown>) || {},
    stepOrder: index,
  }));
  replaceWorkflowSteps(workflow.id, steps);
  updateAiSuggestionStatus(input.suggestionId, 'approved');
  createAiActivity({
    companyId: input.companyId,
    message: `AI workflow approved: ${workflow.name}`,
    type: 'workflow',
  });
  return workflow;
}

