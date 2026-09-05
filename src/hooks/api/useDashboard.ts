import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_PIPELINE_STAGES = [
  { key: 'discovery', name: 'Discovery', color: '#3B82F6' },
  { key: 'proposal', name: 'Proposal', color: '#F59E0B' },
  { key: 'negotiation', name: 'Negotiation', color: '#8B5CF6' },
  { key: 'won', name: 'Won', color: '#22C55E' },
  { key: 'lost', name: 'Lost', color: '#EF4444' },
] as const;

export interface DashboardData {
  leads: { total: number; new: number; qualified: number; contacted: number; newThisMonth: number };
  deals: { total: number; value: number; won: number; lost: number; wonValue: number; openValue: number };
  employees: { total: number; active: number };
  tasks: { pending: number; completed: number; inProgress: number };
  emails: { total: number; unread: number };
  pipeline: { stages: { name: string; count: number; color: string; value: number; stalled: number }[] };
  customers: { total: number };
  invoices: {
    total: number; paid: number; overdue: number; totalValue: number;
    overdueValue: number; monthValue: number; lastMonthValue: number;
  };
}

export interface FocusItem {
  kind: 'invoice' | 'deal' | 'lead' | 'followup';
  id: string;
  label: string;
  company: string | null;
  amount: number | null;
  days: number;
  stage: string | null;
  overdue: boolean;
}

export interface FollowUpItem {
  id: string;
  name: string;
  company_name: string | null;
  status: string;
  score: number | null;
  value: number | null;
  days_since_contact: number;
  overdue: boolean;
  priority: number;
  reason: string;
}

export interface DashboardSummary extends DashboardData {
  revenueByDay: { label: string; value: number }[];
  trends: { leads: { v: number }[]; deals: { v: number }[]; won: { v: number }[] };
  today: {
    meetings: { id: string; title: string; start_time: string; end_time: string }[];
    tasks: { id: string; title: string; due_date: string | null; priority: string | null }[];
  };
  followUps: FollowUpItem[];
  focusItems: FocusItem[];
}

// Everything the dashboard needs, aggregated server-side in a single RPC call
// instead of the 30+ per-table REST calls (counts, unbounded row fetches for
// client-side summing, and separate revenue/trend/followup queries) this page
// used to fire on every load — see get_dashboard_summary() migration.
export function useDashboard() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: async (): Promise<DashboardSummary> => {
      const { data, error } = await supabase.rpc('get_dashboard_summary');
      if (error) throw error;

      const summary = data as unknown as DashboardSummary;
      if (!summary.pipeline?.stages?.length) {
        summary.pipeline = { stages: DEFAULT_PIPELINE_STAGES.map(s => ({ name: s.name, color: s.color, count: 0, value: 0, stalled: 0 })) };
      }

      // Manually logged follow-ups (crm_activities.next_step_at) due today
      // or overdue — merged client-side since they're a separate table from
      // the RPC's invoice/deal/lead signals.
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const { data: followups } = await supabase
        .from('crm_activities')
        .select('id, entity_type, entity_id, body, next_step_at, type')
        .is('completed_at', null)
        .not('next_step_at', 'is', null)
        .lte('next_step_at', endOfToday.toISOString())
        .order('next_step_at', { ascending: true })
        .limit(10);

      if (followups?.length) {
        const customerIds = followups.filter(f => f.entity_type === 'customer').map(f => f.entity_id);
        const { data: customers } = customerIds.length
          ? await supabase.from('customers').select('id, name').in('id', customerIds)
          : { data: [] as { id: string; name: string }[] };
        const nameById = new Map((customers ?? []).map(c => [c.id, c.name]));

        const followupItems: FocusItem[] = followups.map(f => {
          const dueAt = new Date(f.next_step_at!);
          const days = Math.floor((Date.now() - +dueAt) / 86400000);
          return {
            kind: 'followup',
            id: f.entity_type === 'customer' ? f.entity_id : f.id,
            label: f.body || 'Opfølgning',
            company: f.entity_type === 'customer' ? (nameById.get(f.entity_id) ?? null) : null,
            amount: null,
            days: Math.max(days, 0),
            stage: null,
            overdue: days > 0,
          };
        });
        summary.focusItems = [...followupItems, ...(summary.focusItems ?? [])];
      }

      return summary;
    },
  });
}
