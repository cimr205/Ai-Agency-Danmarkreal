import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      const { data, error } = await supabase.functions.invoke('ai-operating-manager', {
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
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return (data as { action: ProposedAction }).action;
    },
  });
}

/** Approve or reject a prepared action. Approval executes it server-side. */
export function useReviewAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ actionId, operation }: { actionId: string; operation: 'approve' | 'reject' }) => {
      const { data, error } = await supabase.functions.invoke('ai-operating-manager', {
        body: { operation, actionId },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data as { action?: ProposedAction; result?: Record<string, unknown>; idempotentReplay?: boolean; status?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['autopilot-actions'] });
      qc.invalidateQueries({ queryKey: ['client-graph'] });
    },
  });
}
