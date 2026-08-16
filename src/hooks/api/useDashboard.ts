import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_PIPELINE_STAGES = [
  { key: 'discovery', name: 'Discovery', color: '#3B82F6' },
  { key: 'proposal', name: 'Proposal', color: '#F59E0B' },
  { key: 'negotiation', name: 'Negotiation', color: '#8B5CF6' },
  { key: 'won', name: 'Won', color: '#22C55E' },
  { key: 'lost', name: 'Lost', color: '#EF4444' },
] as const;

function normalizeStageKey(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}

export interface DashboardData {
  leads: { total: number; new: number; qualified: number; contacted: number };
  deals: { total: number; value: number; won: number; lost: number; wonValue: number };
  employees: { total: number; active: number };
  tasks: { pending: number; completed: number; inProgress: number };
  emails: { total: number; unread: number };
  pipeline: { stages: { name: string; count: number; color: string }[] };
  customers: { total: number };
  invoices: { total: number; paid: number; overdue: number; totalValue: number };
}

type PipelineStageSummary = DashboardData['pipeline']['stages'][number];

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<DashboardData> => {
      // Use count queries instead of fetching all rows (breaks at 1000+ rows)
      const [
        leadsTotal, leadsNew, leadsContacted, leadsQualified,
        dealsAll, dealsWon, dealsLost,
        employeesTotal, employeesActive,
        tasksPending, tasksInProgress, tasksCompleted,
        emailsTotal, emailsUnread,
        pipelineRes,
        customersTotal,
        invoicesTotal, invoicesPaid, invoicesOverdue, invoicesTotalValue,
      ] = await Promise.all([
        // Leads
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'contacted'),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'qualified'),
        // Deals - need values so fetch minimal columns
        supabase.from('deals').select('stage, value'),
        supabase.from('deals').select('*', { count: 'exact', head: true }).eq('stage', 'won'),
        supabase.from('deals').select('*', { count: 'exact', head: true }).eq('stage', 'lost'),
        // Employees
        supabase.from('employee_profiles').select('*', { count: 'exact', head: true }),
        supabase.from('employee_profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
        // Tasks
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        // Emails
        supabase.from('emails').select('*', { count: 'exact', head: true }),
        supabase.from('emails').select('*', { count: 'exact', head: true }).eq('is_read', false),
        // Pipeline stages
        supabase.from('pipeline_stages').select('id, name, color, order_index').order('order_index'),
        // Customers
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        // Invoices
        supabase.from('invoices').select('*', { count: 'exact', head: true }),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'paid'),
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'overdue'),
        supabase.from('invoices').select('amount'),
      ]);

      const deals = (dealsAll.data ?? []) as Array<{ stage: string | null; value: number | null }>;
      const stages = (pipelineRes.data ?? []) as Array<{ name: string; color: string | null }>;
      const invoiceAmounts = (invoicesTotalValue.data ?? []) as Array<{ amount: number | null }>;

      const normalizedStages = stages.length > 0
        ? stages.map((stage) => ({
            key: normalizeStageKey(stage.name),
            name: stage.name,
            color: stage.color || '#3B82F6',
          }))
        : [...DEFAULT_PIPELINE_STAGES];

      const stageMap = new Map<string, PipelineStageSummary>(
        normalizedStages.map(
          (stage): [string, PipelineStageSummary] => [
            stage.key,
            { name: stage.name, color: stage.color, count: 0 },
          ],
        ),
      );

      deals.forEach(d => {
        const key = normalizeStageKey(d.stage);
        if (key && stageMap.has(key)) {
          stageMap.get(key)!.count++;
        } else if (key) {
          stageMap.set(key, {
            name: d.stage,
            color: '#64748B',
            count: 1,
          });
        }
      });

      const wonValue = deals
        .filter(d => normalizeStageKey(d.stage) === 'won')
        .reduce((sum, d) => sum + Number(d.value || 0), 0);
      const totalDealValue = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);
      const totalInvoiceValue = invoiceAmounts.reduce((sum, i) => sum + Number(i.amount || 0), 0);

      const result: DashboardData = {
        leads: {
          total: leadsTotal.count ?? 0,
          new: leadsNew.count ?? 0,
          qualified: leadsQualified.count ?? 0,
          contacted: leadsContacted.count ?? 0,
        },
        deals: {
          total: deals.length,
          value: totalDealValue,
          won: dealsWon.count ?? 0,
          lost: dealsLost.count ?? 0,
          wonValue,
        },
        employees: {
          total: employeesTotal.count ?? 0,
          active: employeesActive.count ?? 0,
        },
        tasks: {
          pending: tasksPending.count ?? 0,
          completed: tasksCompleted.count ?? 0,
          inProgress: tasksInProgress.count ?? 0,
        },
        emails: {
          total: emailsTotal.count ?? 0,
          unread: emailsUnread.count ?? 0,
        },
        pipeline: {
          stages: Array.from(stageMap.values()),
        },
        customers: { total: customersTotal.count ?? 0 },
        invoices: {
          total: invoicesTotal.count ?? 0,
          paid: invoicesPaid.count ?? 0,
          overdue: invoicesOverdue.count ?? 0,
          totalValue: totalInvoiceValue,
        },
      };

      return result;
    },
  });
}
