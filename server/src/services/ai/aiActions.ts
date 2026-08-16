import { createAiSuggestion } from '../../repositories/aiSuggestionRepository';
import { createAiActivity } from '../../repositories/aiActivityRepository';
import { createWorkflow, replaceWorkflowSteps } from '../../repositories/workflowRepository';
import { randomUUID } from 'crypto';

export type AiChatResponse = {
  message: string;
  action?: {
    type: 'suggest_workflow' | 'create_workflow';
    payload: Record<string, unknown>;
  };
};

export function handleAiAction(companyId: string, response: AiChatResponse) {
  if (response.action?.type === 'suggest_workflow') {
    createAiSuggestion({
      companyId,
      type: 'workflow',
      title: String(response.action.payload.title || 'AI workflow'),
      description: String(response.action.payload.description || ''),
      json: response.action.payload,
    });
    createAiActivity({
      companyId,
      message: 'AI suggested a workflow',
      type: 'workflow',
    });
  }

  if (response.action?.type === 'create_workflow') {
    const name = String(response.action.payload.name || 'AI workflow');
    const trigger = String(response.action.payload.trigger || 'new_lead_created') as
      | 'new_lead_created'
      | 'integration_connected'
      | 'manual_trigger';
    const steps = Array.isArray(response.action.payload.steps) ? response.action.payload.steps : [];
    const workflow = createWorkflow({
      userId: companyId,
      name,
      status: 'active',
      triggerType: trigger,
      nodeRedFlowId: `nr_${randomUUID()}`,
    });
    const mappedSteps = steps.map((step, index) => ({
      id: randomUUID(),
      workflowId: workflow.id,
      type: String(step.type || 'action') as 'condition' | 'action' | 'delay',
      config: (step.config as Record<string, unknown>) || {},
      stepOrder: index,
    }));
    replaceWorkflowSteps(workflow.id, mappedSteps);
    createAiActivity({
      companyId,
      message: `AI created workflow: ${workflow.name}`,
      type: 'workflow',
    });
  }
}

