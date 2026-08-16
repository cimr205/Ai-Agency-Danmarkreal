import { listPendingWorkflowRuns, updateWorkflowRun } from '../repositories/workflowRepository';
import { runWorkflowStep } from '../services/workflowEngine';

const DEFAULT_INTERVAL_MS = 1000 * 30;

export function startWorkflowWorker() {
  const tick = async () => {
    const now = new Date();
    const runs = listPendingWorkflowRuns();
    for (const run of runs) {
      if (run.status === 'waiting' && run.nextRunAt && new Date(run.nextRunAt) > now) {
        continue;
      }
      updateWorkflowRun(run.id, { status: 'running' });
      await runWorkflowStep(run.id, run.workflowId, run.leadId, run.currentStep);
    }
  };

  tick().catch(() => undefined);
  const handle = setInterval(() => {
    tick().catch(() => undefined);
  }, DEFAULT_INTERVAL_MS);

  return () => clearInterval(handle);
}

