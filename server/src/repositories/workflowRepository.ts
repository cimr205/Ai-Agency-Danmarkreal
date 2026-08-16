import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreWorkflow, StoreWorkflowStep, StoreWorkflowRun } from '../db';

export function createWorkflow(input: {
  userId: string;
  name: string;
  status: StoreWorkflow['status'];
  triggerType: StoreWorkflow['triggerType'];
  nodeRedFlowId?: string;
}) {
  const now = new Date().toISOString();
  const record: StoreWorkflow = {
    id: randomUUID(),
    userId: input.userId,
    name: input.name,
    nodeRedFlowId: input.nodeRedFlowId,
    status: input.status,
    triggerType: input.triggerType,
    createdAt: now,
    updatedAt: now,
  };
  updateStore((store) => {
    store.workflows.push(record);
  });
  return record;
}

export function listWorkflows(userId: string) {
  const store = readStore();
  return store.workflows.filter((workflow) => workflow.userId === userId);
}

export function findWorkflow(id: string) {
  const store = readStore();
  return store.workflows.find((workflow) => workflow.id === id) || null;
}

export function updateWorkflow(id: string, updates: Partial<StoreWorkflow>) {
  let updated: StoreWorkflow | null = null;
  updateStore((store) => {
    const workflow = store.workflows.find((item) => item.id === id);
    if (!workflow) return;
    Object.assign(workflow, updates, { updatedAt: new Date().toISOString() });
    updated = workflow;
  });
  return updated;
}

export function replaceWorkflowSteps(workflowId: string, steps: StoreWorkflowStep[]) {
  updateStore((store) => {
    store.workflowSteps = store.workflowSteps.filter((step) => step.workflowId !== workflowId);
    store.workflowSteps.push(...steps);
  });
}

export function listWorkflowSteps(workflowId: string) {
  const store = readStore();
  return store.workflowSteps
    .filter((step) => step.workflowId === workflowId)
    .sort((a, b) => a.stepOrder - b.stepOrder);
}

export function createWorkflowRun(input: {
  workflowId: string;
  leadId?: string;
  status: StoreWorkflowRun['status'];
  currentStep: number;
  nextRunAt?: string;
}) {
  const now = new Date().toISOString();
  const record: StoreWorkflowRun = {
    id: randomUUID(),
    workflowId: input.workflowId,
    leadId: input.leadId,
    status: input.status,
    currentStep: input.currentStep,
    nextRunAt: input.nextRunAt,
    createdAt: now,
    updatedAt: now,
  };
  updateStore((store) => {
    store.workflowRuns.push(record);
  });
  return record;
}

export function updateWorkflowRun(id: string, updates: Partial<StoreWorkflowRun>) {
  let updated: StoreWorkflowRun | null = null;
  updateStore((store) => {
    const run = store.workflowRuns.find((item) => item.id === id);
    if (!run) return;
    Object.assign(run, updates, { updatedAt: new Date().toISOString() });
    updated = run;
  });
  return updated;
}

export function listPendingWorkflowRuns() {
  const store = readStore();
  return store.workflowRuns.filter((run) => run.status === 'running' || run.status === 'waiting');
}

