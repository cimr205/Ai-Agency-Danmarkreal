import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeFunction } from '@/lib/functions';

/**
 * AI-assisted lead actions. These drive the deployed `ai-operating-manager`
 * action layer: `propose` prepares an immutable, permission-checked action
 * contract (no side effect), and `approve`/`reject` are the human decision —
 * approval executes server-side exactly once through real business logic
 * (tasks.create) with an audit trail. The browser never executes the side
 * effect itself; it only proposes and records the user's decision.
 */
export interface ProposedAction {
  id: string;
  action_type: string;
  execution_function: string | null;
  headline: string;
  rationale: string | null;
  status: string;
  risk_level: string;
  required_permission: string;
  payload: Record<string, unknown> | null;
  preview: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
}

/** Prepare a follow-up task for a lead. Returns an awaiting_approval action. */
export function useProposeFollowup() {
  return useMutation({
    mutationFn: async (input: { leadId: string; title: string; dueDate: string; priority?: string }): Promise<ProposedAction> => {
      const data = await invokeFunction<{ error?: string; action: ProposedAction }>('ai-operating-manager', {
        body: {
          operation: 'propose',
          actionName: 'tasks.create',
          input: { title: input.title, due_date: input.dueDate, priority: input.priority ?? 'high', lead_id: input.leadId },
          reason: 'Forberedt opfølgning på lead',
          // Stable per lead+title so a double-click reuses the same proposal
          // instead of creating a second one.
          idempotencyKey: `lead-followup:${input.leadId}:${input.title}`.slice(0, 180),
        },
      });
      if (data?.error) throw new Error(data.error);
      return data.action;
    },
  });
}

/** Approve or reject a prepared action. Approval executes it server-side. */
export function useReviewAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ actionId, operation }: { actionId: string; operation: 'approve' | 'reject' }) => {
      const data = await invokeFunction<{ error?: string; action?: ProposedAction; result?: Record<string, unknown>; idempotentReplay?: boolean; status?: string }>('ai-operating-manager', {
        body: { operation, actionId },
      });
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['autopilot-actions'] });
      qc.invalidateQueries({ queryKey: ['client-graph'] });
    },
  });
}
